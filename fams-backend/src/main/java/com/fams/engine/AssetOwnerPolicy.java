package com.fams.engine;

import com.fams.security.AuthContext;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.util.Arrays;
import java.util.HashSet;
import java.util.Map;
import java.util.Set;

/**
 * 「台账使用人本人可发起自己名下资产的业务」授权规则。
 *
 * <p>权限码矩阵描述的是角色职责，台账 {@code fixed_assets.userId} 才是业务上的资产使用人。
 * 期初导入、派发后的使用人未必持有 {@code fa:*} 发起权限码（例如部门主管自己领用资产），
 * 若只按权限码拦截，这些资产就没有任何人能从台账发起流程，变成死数据。
 * 本规则作为权限码之外的兜底，只放行流程定义中「由资产使用人发起」的单据。</p>
 *
 * <p>放行边界（fail-closed）：</p>
 * <ol>
 *   <li>仅 WF3 退库 / WF4 借出 / WF6 维修 / WF7 变更四类，依据
 *       {@code system_workflow_flows.initiator_role_id = R3}；入库、派发、调拨、处置仍由资产管理员办理。</li>
 *   <li>单据 {@code assetId} 指向的资产 {@code userId} 必须等于当前登录人。</li>
 *   <li>新增时强制把 {@code creatorId} 写成当前登录人，既防伪造创建人，
 *       也与 DEPT_ONLY 数据范围（按 creatorId 过滤）保持一致，使用人能看到自己发起的单据。</li>
 *   <li>修改 / 删除只允许操作自己创建的单据，且新旧 {@code assetId} 都必须是本人名下资产；
 *       校验一律以库中旧单据为准，不采信客户端 payload。</li>
 *   <li>批量写、清空集合、读接口不走本规则。</li>
 * </ol>
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class AssetOwnerPolicy {

    private static final String ASSETS = "fixed-assets";

    /** 流程定义中由资产使用人（R3）发起的四类单据 */
    private static final Set<String> OWNER_INITIATED = new HashSet<>(Arrays.asList(
            "fixed-asset-doc-lists-back",
            "fixed-asset-doc-lists-borrow",
            "fixed-asset-doc-lists-repair",
            "fixed-asset-doc-lists-change"));

    private final GenericService genericService;

    /**
     * @param payload POST/PUT 的请求体；DELETE 为 null
     * @param docId   PUT/DELETE 的路径主键
     */
    public boolean allows(String key, String method, Map<String, Object> payload, String docId) {
        if (!OWNER_INITIATED.contains(key)) {
            return false;
        }
        String verb = method == null ? "" : method.toUpperCase();
        String me = AuthContext.currentUserId();
        if (me == null || me.isEmpty()) {
            return false;
        }
        if ("POST".equals(verb)) {
            if (payload == null || !ownedBy(text(payload.get("assetId")), me)) {
                return false;
            }
            payload.put("creatorId", me);
            return true;
        }
        if (!"PUT".equals(verb) && !"DELETE".equals(verb)) {
            return false;
        }
        if (isBlank(docId)) {
            return false;
        }
        Map<String, Object> stored = readQuietly(key, docId);
        if (stored == null || !me.equals(text(stored.get("creatorId")))) {
            return false;
        }
        if (!ownedBy(text(stored.get("assetId")), me)) {
            return false;
        }
        // 编辑时不允许把单据改挂到别人名下资产
        String nextAssetId = payload == null ? "" : text(payload.get("assetId"));
        return nextAssetId.isEmpty() || ownedBy(nextAssetId, me);
    }

    private boolean ownedBy(String assetId, String userId) {
        if (isBlank(assetId)) {
            return false;
        }
        Map<String, Object> asset = readQuietly(ASSETS, assetId);
        return asset != null && userId.equals(text(asset.get("userId")));
    }

    private Map<String, Object> readQuietly(String key, String id) {
        try {
            return genericService.get(key, id);
        } catch (RuntimeException e) {
            log.debug("[asset-owner] 读取 {} / {} 失败：{}", key, id, e.getMessage());
            return null;
        }
    }

    private static boolean isBlank(String value) {
        return value == null || value.trim().isEmpty();
    }

    private static String text(Object value) {
        return value == null ? "" : String.valueOf(value);
    }
}
