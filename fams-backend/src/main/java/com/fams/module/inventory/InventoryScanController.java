package com.fams.module.inventory;

import com.fams.common.ApiException;
import com.fams.common.ErrorCode;
import com.fams.common.R;
import com.fams.security.AuthContext;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Collections;
import java.util.List;
import java.util.Map;

/**
 * 扫码盘点端点（契约外独立业务端点，不改动通用 CRUD 契约）。
 *
 * <p>GET  /api/inventory-scan/docs              当前账号可执行的盘点单摘要
 * POST /api/inventory-scan/{docId}/record      按资产编号登记一条盘点结果</p>
 */
@RestController
@RequestMapping("/api/inventory-scan")
@RequiredArgsConstructor
public class InventoryScanController {

    private static final String PERMISSION = "fa:inventory";

    private final InventoryScanService inventoryScanService;

    @GetMapping("/docs")
    public R<List<Map<String, Object>>> docs() {
        require();
        return R.ok(inventoryScanService.availableDocs());
    }

    @PostMapping("/{docId}/record")
    public R<Map<String, Object>> record(@PathVariable("docId") String docId,
                                         @RequestBody(required = false) Map<String, Object> body) {
        require();
        return R.ok(inventoryScanService.record(docId, body == null ? Collections.emptyMap() : body));
    }

    /** 盘点执行权沿用既有权限码，不新增权限项 */
    private static void require() {
        if (!AuthContext.hasPermission(PERMISSION)) {
            throw new ApiException(ErrorCode.FORBIDDEN, "无盘点执行权限：" + PERMISSION);
        }
    }
}
