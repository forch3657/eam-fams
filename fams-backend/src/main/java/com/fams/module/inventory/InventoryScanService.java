package com.fams.module.inventory;

import com.fams.common.ApiException;
import com.fams.common.ErrorCode;
import com.fams.engine.GenericService;
import com.fams.security.AuthContext;
import com.fams.security.UserPrincipal;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * 扫码盘点：按资产编号逐条登记盘点结果。
 *
 * <p>与「盘点清单整单保存」的区别：本服务只改 items 里的一条明细，
 * 并复用 {@link GenericService#update} 的 version 乐观锁与单据状态守卫，
 * 因此多人同时扫同一张盘点单不会互相覆盖；冲突由 409 返回，前端刷新后重试。</p>
 *
 * <p>刻意不在本类上加 @Transactional：get 与 update 各自独立事务，
 * 保证 get 读到的是最新已提交版本，UPDATE 的 expectedVersion 条件下推
 * 用当前读判定冲突（MySQL RR 快照不会掩盖并发写）。</p>
 */
@Service
@RequiredArgsConstructor
public class InventoryScanService {

    private static final String DOCS = "fixed-asset-inventory-docs";

    /** 与前端 checkListEditable / GenericService.assertDocMutable 一致：只有草稿、驳回可改明细 */
    private static final Set<String> EDITABLE_STATUS = new HashSet<>(Arrays.asList("DRAFT", "REJECTED"));

    /** INVENTORY_RESULT 编码；默认扫码即「账实相符」 */
    private static final Set<String> RESULTS = new HashSet<>(Arrays.asList("MATCHED", "SURPLUS", "LOSS", "ABNORMAL"));

    private static final Set<String> NEED_REASON = new HashSet<>(Arrays.asList("SURPLUS", "LOSS", "ABNORMAL"));

    /** INVENTORY_DISPOSAL 白名单，异常明细必须给出去向 */
    private static final Set<String> DISPOSALS = new HashSet<>(Arrays.asList("REPAIR", "CHANGE", "EXPLAINED"));

    /** 与前端 ITEM_STATUS_OF_RESULT 同源：result 派生明细状态 */
    private static final Map<String, String> ITEM_STATUS = new LinkedHashMap<>();
    static {
        ITEM_STATUS.put("MATCHED", "CHECKED");
        ITEM_STATUS.put("SURPLUS", "SURPLUS");
        ITEM_STATUS.put("LOSS", "LOSS");
        ITEM_STATUS.put("ABNORMAL", "ABNORMAL");
        ITEM_STATUS.put("UNCHECKED", "UNCHECKED");
    }

    private final GenericService genericService;

    /**
     * 当前账号可执行的盘点单（草稿/驳回 + 分派给本人），供手机扫码页选单。
     * 只返回摘要，明细仍由业务页按需读取，避免一次拉回整单 LONGTEXT。
     */
    public List<Map<String, Object>> availableDocs() {
        UserPrincipal me = requireUser();
        List<Map<String, Object>> rows = genericService.list(DOCS, Collections.emptyMap());
        List<Map<String, Object>> out = new ArrayList<>();
        for (Map<String, Object> row : rows) {
            String status = text(row.get("status"));
            if (!EDITABLE_STATUS.contains(status) || !isAssigned(row, me)) {
                continue;
            }
            List<Map<String, Object>> items = asMaps(row.get("items"));
            Map<String, Object> brief = new LinkedHashMap<>();
            brief.put("id", row.get("id"));
            brief.put("docNo", row.get("docNo"));
            brief.put("name", row.get("name"));
            brief.put("scope", row.get("scope"));
            brief.put("status", status);
            brief.put("total", items.size());
            brief.put("counted", countRegistered(items));
            out.add(brief);
        }
        return out;
    }

    /**
     * 登记一条扫码结果。
     *
     * <p>返回 status 表达业务分支（前端据此显示不同颜色卡片），只有真正的错误才抛异常：
     * RECORDED 已登记 / DUPLICATE 重复扫 / IDEMPOTENT 同一扫码幂等重试 / NOT_IN_SCOPE 清单外资产。</p>
     */
    public Map<String, Object> record(String docId, Map<String, Object> body) {
        UserPrincipal me = requireUser();
        Map<String, Object> input = body == null ? Collections.emptyMap() : body;

        String assetNo = text(input.get("assetNo"));
        if (assetNo.isEmpty()) {
            throw new ApiException(ErrorCode.BAD_REQUEST, "缺少资产编号");
        }
        String result = text(input.get("result"));
        if (result.isEmpty()) {
            result = "MATCHED";
        }
        if (!RESULTS.contains(result)) {
            throw new ApiException(ErrorCode.BAD_REQUEST, "无效的盘点结果：" + result);
        }
        String remark = text(input.get("remark"));
        String disposal = text(input.get("disposal"));
        String clientScanId = text(input.get("clientScanId"));
        boolean overwrite = "true".equalsIgnoreCase(String.valueOf(input.get("overwrite")));

        // 与前端 saveCheckResults 的前置校验保持一致，避免绕过页面直接调接口写出悬空差异
        if (NEED_REASON.contains(result) && remark.isEmpty()) {
            throw new ApiException(ErrorCode.BAD_REQUEST, "盘盈 / 盘亏 / 异常必须填写原因");
        }
        if ("ABNORMAL".equals(result) && !DISPOSALS.contains(disposal)) {
            throw new ApiException(ErrorCode.BAD_REQUEST, "异常资产必须选择处理去向（转维修单 / 转变更单 / 已说明）");
        }
        if (!"ABNORMAL".equals(result)) {
            disposal = "";
        }

        Map<String, Object> doc = genericService.get(DOCS, docId);
        String status = text(doc.get("status"));
        if (!EDITABLE_STATUS.contains(status)) {
            throw new ApiException(ErrorCode.CONFLICT,
                    "盘点单已提交审批或已完结，明细只读；如需修改请先撤销审批");
        }
        assertAssigned(doc, me);

        List<Map<String, Object>> items = asMaps(doc.get("items"));

        // 幂等：网络超时后同一 clientScanId 重发，不重复计数、不覆盖他人的后续改判
        if (!clientScanId.isEmpty()) {
            for (Map<String, Object> item : items) {
                if (clientScanId.equals(text(item.get("scanId")))) {
                    return outcome("IDEMPOTENT", doc, item, items, doc.get("version"),
                            "该扫码已登记，无需重复提交");
                }
            }
        }

        Map<String, Object> target = null;
        for (Map<String, Object> item : items) {
            if (assetNo.equals(text(item.get("assetNo")))) {
                target = item;
                break;
            }
        }
        if (target == null) {
            Map<String, Object> res = base("NOT_IN_SCOPE", doc, items, doc.get("version"));
            res.put("assetNo", assetNo);
            res.put("message", "该资产不在本单应盘清单，请核对标签或登记账外资产");
            return res;
        }

        String previousResult = text(target.get("result"));
        boolean registered = !previousResult.isEmpty() && !"UNCHECKED".equals(previousResult);
        if (registered && !overwrite) {
            return outcome("DUPLICATE", doc, target, items, doc.get("version"),
                    "该资产已登记为「" + previousResult + "」，如需改判请显式提交新的结果");
        }

        String now = Instant.now().toString();
        target.put("result", result);
        target.put("itemStatus", ITEM_STATUS.getOrDefault(result, "UNCHECKED"));
        target.put("disposal", disposal);
        if (registered) {
            String oldRemark = text(target.get("remark"));
            target.put("remark", oldRemark.isEmpty() ? remark : remark + "（改判自：" + oldRemark + "）");
        } else {
            target.put("remark", remark);
        }
        target.put("checker", me.getId());
        target.put("checkerName", me.getName().isEmpty() ? me.getUsername() : me.getName());
        target.put("checkTime", now);
        target.put("scanId", clientScanId);

        List<Map<String, Object>> counters = asMaps(doc.get("counters"));
        recalcCounters(counters, items);

        // update 是全量替换语义：以 get 返回的完整行做底稿，只替换 items / counters。
        // version 必须带上，GenericService 才会把乐观锁条件下推到 UPDATE（冲突返 409）。
        Map<String, Object> payload = new LinkedHashMap<>(doc);
        payload.put("items", items);
        payload.put("counters", counters);
        if (doc.get("version") != null) {
            payload.put("version", doc.get("version"));
        }

        Map<String, Object> saved = genericService.update(DOCS, docId, payload);
        return outcome("RECORDED", doc, target, items, saved.get("version"), "登记成功");
    }

    /** 盘点员进度：与盘点清单 saveCheckResults 的口径一致，按各自分派数判定 DONE */
    private static void recalcCounters(List<Map<String, Object>> counters, List<Map<String, Object>> items) {
        for (Map<String, Object> counter : counters) {
            String counterId = text(counter.get("userId"));
            long done = items.stream()
                    .filter(i -> counterId.equals(text(i.get("checker"))) && isRegistered(i))
                    .count();
            int assigned = intOf(counter.get("assigned"));
            counter.put("done", done);
            counter.put("status", assigned > 0 && done >= assigned ? "DONE" : "COUNTING");
        }
    }

    private Map<String, Object> outcome(String status, Map<String, Object> doc,
                                        Map<String, Object> item, List<Map<String, Object>> items,
                                        Object version, String message) {
        Map<String, Object> res = base(status, doc, items, version);
        res.put("assetNo", text(item.get("assetNo")));
        res.put("assetName", text(item.get("assetName")));
        res.put("result", text(item.get("result")));
        res.put("checkerName", text(item.get("checkerName")));
        res.put("checkTime", text(item.get("checkTime")));
        res.put("message", message);
        return res;
    }

    private Map<String, Object> base(String status, Map<String, Object> doc,
                                     List<Map<String, Object>> items, Object version) {
        Map<String, Object> res = new LinkedHashMap<>();
        res.put("status", status);
        res.put("docId", doc.get("id"));
        res.put("docNo", text(doc.get("docNo")));
        res.put("total", items.size());
        res.put("counted", countRegistered(items));
        res.put("version", version);
        return res;
    }

    private static long countRegistered(List<Map<String, Object>> items) {
        return items.stream().filter(InventoryScanService::isRegistered).count();
    }

    private static boolean isRegistered(Map<String, Object> item) {
        String result = text(item.get("result"));
        return !result.isEmpty() && !"UNCHECKED".equals(result);
    }

    /** counters 为空视为历史单据未分派，持 fa:inventory 即可盘点；否则必须点名匹配 */
    private static boolean isAssigned(Map<String, Object> doc, UserPrincipal me) {
        // 系统管理员 R1 与通用服务的维护通道保持一致，可盘点任意未送审单据
        if (me.getRoleIds() != null && me.getRoleIds().contains("R1")) {
            return true;
        }
        List<Map<String, Object>> counters = asMaps(doc.get("counters"));
        if (counters.isEmpty()) {
            return true;
        }
        return counters.stream().anyMatch(c -> me.getId().equals(text(c.get("userId"))));
    }

    private static void assertAssigned(Map<String, Object> doc, UserPrincipal me) {
        if (isAssigned(doc, me)) {
            return;
        }
        String names = asMaps(doc.get("counters")).stream()
                .map(c -> text(c.get("name")))
                .filter(s -> !s.isEmpty())
                .distinct()
                .collect(Collectors.joining("、"));
        throw new ApiException(ErrorCode.FORBIDDEN,
                "当前账号未分派到该盘点单，无法登记盘点结果（本单盘点员：" + names + "）");
    }

    private static UserPrincipal requireUser() {
        UserPrincipal principal = AuthContext.current();
        if (principal == null) {
            throw new ApiException(ErrorCode.UNAUTHORIZED, "请先登录");
        }
        return principal;
    }

    @SuppressWarnings("unchecked")
    private static List<Map<String, Object>> asMaps(Object value) {
        List<Map<String, Object>> out = new ArrayList<>();
        if (!(value instanceof List)) {
            return out;
        }
        for (Object element : (List<?>) value) {
            if (element instanceof Map) {
                out.add(new LinkedHashMap<>((Map<String, Object>) element));
            }
        }
        return out;
    }

    private static String text(Object value) {
        return value == null ? "" : String.valueOf(value).trim();
    }

    private static int intOf(Object value) {
        try {
            return Integer.parseInt(String.valueOf(value));
        } catch (Exception e) {
            return 0;
        }
    }
}
