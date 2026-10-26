package com.fams.common;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * 分页结果（契约 1.2）：{ rows, total, page, pageSize }。
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
public class PageResult {

    private List<Map<String, Object>> rows = new ArrayList<>();

    private long total;

    private long page;

    private long pageSize;
}
