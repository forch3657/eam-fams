package com.fams.imports;

import com.fams.common.ApiException;
import com.fams.common.ErrorCode;
import com.fams.common.R;
import com.fams.engine.PermissionPolicy;
import com.fams.security.AuthContext;
import lombok.RequiredArgsConstructor;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import javax.servlet.http.HttpServletResponse;
import java.util.List;
import java.io.IOException;
import java.nio.charset.StandardCharsets;

/**
 * 通用数据导入端点：与 {@code /api/{key}} 通用 CRUD 共用同一套权限策略（能新增单条即能批量导入）。
 *
 * <p>路径刻意使用独立前缀 {@code /api/data-import}，避免与通用引擎的 {@code /api/{key}} 通配路由冲突。</p>
 */
@RestController
@RequestMapping("/api/data-import")
@RequiredArgsConstructor
public class DataImportController {

    private final DataImportService service;
    private final PermissionPolicy permissionPolicy;

    /** 可导入资源列表（含字段元数据，供前端构建模板与映射 UI） */
    @GetMapping("/resources")
    public R<List<DataImportService.ResourceInfo>> resources() {
        return R.ok(service.listResources());
    }

    /** 下载 CSV 模板：表头为字段名，带 BOM 以便 Excel 正确识别 UTF-8 */
    @GetMapping("/template")
    public void template(@RequestParam String key, HttpServletResponse response) throws IOException {
        require(key);
        response.setContentType("text/csv;charset=utf-8");
        response.setHeader("Content-Disposition",
                "attachment; filename=\"" + key + "-template.csv\"");
        response.getOutputStream().write(("﻿" + service.templateCsv(key)).getBytes(StandardCharsets.UTF_8));
    }

    /** 上传并导入（CSV / XLSX） */
    @PostMapping(value = "/upload", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public R<DataImportService.ImportResult> upload(@RequestParam String key,
                                                   @RequestParam(defaultValue = "true") boolean abortOnError,
                                                   @RequestParam("file") MultipartFile file) throws IOException {
        require(key);
        if (file == null || file.isEmpty()) {
            throw new ApiException(ErrorCode.VALIDATION, "请上传文件");
        }
        return R.ok(service.doImport(key, file, abortOnError));
    }

    private void require(String key) {
        if (!permissionPolicy.matches(key, "POST", AuthContext.granted())) {
            throw new ApiException(ErrorCode.FORBIDDEN, "无权限导入该数据：" + key);
        }
    }
}
