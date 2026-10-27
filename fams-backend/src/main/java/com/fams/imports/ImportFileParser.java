package com.fams.imports;

import org.apache.poi.ss.usermodel.Workbook;
import org.apache.poi.ss.usermodel.WorkbookFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 导入文件解析（CSV / XLSX / XLS 共用），供「按资源导入」与「组织架构单表导入」复用。
 *
 * <p>约定：模板中以 {@link #NOTE_PREFIX} 开头的「说明 / 示例」行会被自动跳过；
 * 每行保留其在原始表格中的真实行号（表头为第 1 行），便于错误定位。</p>
 */
@Component
public class ImportFileParser {

    /** 说明行 / 示例行前缀：以 # 开头的行在导入时忽略 */
    public static final String NOTE_PREFIX = "#";

    /** 解析上传文件，返回数据行（不含表头、说明行、示例行与空行） */
    public List<ParsedRow> parse(MultipartFile file) throws IOException {
        String name = file.getOriginalFilename();
        List<String[]> matrix;
        if (name != null && (name.toLowerCase().endsWith(".xlsx") || name.toLowerCase().endsWith(".xls"))) {
            matrix = parseExcel(file.getInputStream());
        } else {
            String text = new String(file.getBytes(), StandardCharsets.UTF_8);
            if (!text.isEmpty() && text.charAt(0) == '\uFEFF') {
                text = text.substring(1);
            }
            matrix = parseCsv(text);
        }
        if (matrix.isEmpty()) {
            return Collections.emptyList();
        }
        String[] headers = matrix.get(0);
        for (int i = 0; i < headers.length; i++) {
            headers[i] = headers[i].trim();
        }
        List<ParsedRow> rows = new ArrayList<>();
        for (int r = 1; r < matrix.size(); r++) {
            String[] cells = matrix.get(r);
            int line = r + 1;
            if (isBlankRow(cells)) {
                continue;
            }
            // 以 # 开头的行是模板里的「说明 / 示例」，跳过
            if (cells.length > 0 && cells[0] != null && cells[0].trim().startsWith(NOTE_PREFIX)) {
                continue;
            }
            Map<String, String> values = new LinkedHashMap<>();
            for (int c = 0; c < headers.length; c++) {
                String header = headers[c];
                if (header.isEmpty()) {
                    continue;
                }
                values.put(header, c < cells.length && cells[c] != null ? cells[c].trim() : "");
            }
            rows.add(new ParsedRow(line, values));
        }
        return rows;
    }

    private static boolean isBlankRow(String[] cells) {
        for (String cell : cells) {
            if (cell != null && !cell.trim().isEmpty()) {
                return false;
            }
        }
        return true;
    }

    /** 手写 CSV 解析：支持引号、逗号/分号自动识别（Excel 中文区域常用分号） */
    private List<String[]> parseCsv(String text) {
        char delim = ',';
        int commas = 0;
        int semis = 0;
        for (int i = 0; i < text.length() && text.charAt(i) != '\n'; i++) {
            char c = text.charAt(i);
            if (c == ',') {
                commas++;
            } else if (c == ';') {
                semis++;
            }
        }
        if (semis > commas) {
            delim = ';';
        }
        List<String[]> rows = new ArrayList<>();
        List<String> fields = new ArrayList<>();
        StringBuilder sb = new StringBuilder();
        boolean inQuotes = false;
        for (int i = 0; i < text.length(); i++) {
            char c = text.charAt(i);
            if (inQuotes) {
                if (c == '"') {
                    if (i + 1 < text.length() && text.charAt(i + 1) == '"') {
                        sb.append('"');
                        i++;
                    } else {
                        inQuotes = false;
                    }
                } else {
                    sb.append(c);
                }
            } else if (c == '"') {
                inQuotes = true;
            } else if (c == delim) {
                fields.add(sb.toString());
                sb.setLength(0);
            } else if (c == '\n') {
                fields.add(sb.toString());
                rows.add(fields.toArray(new String[0]));
                fields.clear();
                sb.setLength(0);
            } else if (c != '\r') {
                sb.append(c);
            }
        }
        if (sb.length() > 0 || !fields.isEmpty()) {
            fields.add(sb.toString());
            rows.add(fields.toArray(new String[0]));
        }
        return rows;
    }

    /** Excel 解析（.xlsx / .xls 自动识别） */
    private List<String[]> parseExcel(InputStream in) throws IOException {
        List<String[]> rows = new ArrayList<>();
        try (Workbook wb = WorkbookFactory.create(in)) {
            org.apache.poi.ss.usermodel.Sheet sheet = wb.getSheetAt(0);
            if (sheet == null) {
                return rows;
            }
            for (org.apache.poi.ss.usermodel.Row row : sheet) {
                List<String> cells = new ArrayList<>();
                for (org.apache.poi.ss.usermodel.Cell cell : row) {
                    cells.add(cell == null ? "" : cell.toString().trim());
                }
                rows.add(cells.toArray(new String[0]));
            }
        }
        return rows;
    }

    /** 解析出的一行 + 其在原始表格中的真实行号 */
    public static class ParsedRow {
        public final int line;
        public final Map<String, String> values;

        public ParsedRow(int line, Map<String, String> values) {
            this.line = line;
            this.values = values;
        }
    }
}
