package com.fams.module.depreciation;

import lombok.Data;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;

/**
 * 一次折旧计提的结果（契约 5.8）。
 */
@Data
public class DepreciationResult {

    private String period;

    private BigDecimal openingValue;

    private BigDecimal periodDepreciation;

    private BigDecimal accumulated;

    private BigDecimal closingNet;

    private int assetCount;

    /** 折旧明细行（对应 fixed-asset-report-depreciation-details） */
    private List<Map<String, Object>> details;

    /** 折旧计划明细行（对应 fixed-asset-report-depreciation-plan-details） */
    private List<Map<String, Object>> planDetails;
}
