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
    private final OrgStructureImportService orgService;
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

    // ---------------------------------------------------------------- 组织架构单表导入

    /**
     * 下载组织架构单表模板：表头为中文业务列，带说明行与示例行（以 # 开头，导入时自动跳过）。
     * 客户视角只有「公司—部门—人」这一张表，无需填写任何内部主键。
     */
    @GetMapping("/org-template")
    public void orgTemplate(HttpServletResponse response) throws IOException {
        requireOrgImport();
        response.setContentType("text/csv;charset=utf-8");
        response.setHeader("Content-Disposition", "attachment; filename=\"org-structure-template.csv\"");
        response.getOutputStream().write(("\uFEFF" + orgService.templateCsv()).getBytes(StandardCharsets.UTF_8));
    }

    /** 组织架构单表导入：一次上传，内部自动拆分为公司 / 部门 / 用户三张资源表 */
    @PostMapping(value = "/org-upload", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public R<OrgStructureImportService.OrgImportResult> orgUpload(
            @RequestParam(defaultValue = "true") boolean abortOnError,
            @RequestParam("file") MultipartFile file) throws IOException {
        requireOrgImport();
        if (file == null || file.isEmpty()) {
            throw new ApiException(ErrorCode.VALIDATION, "请上传文件");
        }
        return R.ok(orgService.doImport(file, abortOnError));
    }

    private void require(String key) {
        if (!permissionPolicy.matches(key, "POST", AuthContext.granted())) {
            throw new ApiException(ErrorCode.FORBIDDEN, "无权限导入该数据：" + key);
        }
    }

    /** 组织架构导入会同时写公司/部门/用户，三项新增权限均需具备 */
    private void requireOrgImport() {
        for (String key : new String[]{OrgStructureImportService.COMPANIES,
                OrgStructureImportService.DEPARTMENTS, OrgStructureImportService.USERS}) {
            require(key);
        }
    }
}
