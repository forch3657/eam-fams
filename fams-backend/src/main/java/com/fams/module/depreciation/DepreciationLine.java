package com.fams.module.depreciation;

import lombok.Data;

import java.math.BigDecimal;
import java.math.RoundingMode;

/**
 * 单条资产在某期折旧的计算结果。
 */
@Data
public class DepreciationLine {

    private final String method;

    private final BigDecimal originalValue;

    private final BigDecimal residualRate;

    /** 使用年限（年） */
    private final int usefulLifeYears;

    /** 折旧总月数 */
    private final int totalMonths;

    /** 已计提月数 */
    private final int usedMonths;

    /** 本期折旧额（提足后为 0） */
    private final BigDecimal monthly;

    /** 应计提折旧总额 */
    private final BigDecimal cap;

    /** 残值 = 原值 × 残值率 */
    private final BigDecimal salvage;

    private final BigDecimal[] yearly;

    DepreciationLine(String method, BigDecimal originalValue, BigDecimal residualRate, int usefulLifeYears,
                     int totalMonths, int usedMonths, BigDecimal monthly, BigDecimal cap,
                     BigDecimal salvage, BigDecimal[] yearly) {
        this.method = method;
        this.originalValue = originalValue;
        this.residualRate = residualRate;
        this.usefulLifeYears = usefulLifeYears;
        this.totalMonths = totalMonths;
        this.usedMonths = usedMonths;
        this.monthly = monthly;
        this.cap = cap;
        this.salvage = salvage;
        this.yearly = yearly;
    }

    /** 累计折旧（截至第 m 月月末） */
    public BigDecimal accumulatedUntil(int months) {
        int clamped = Math.max(0, Math.min(months, totalMonths));
        if (clamped <= 0) {
            return BigDecimal.ZERO;
        }
        if (clamped >= totalMonths) {
            return cap;
        }
        int fullYears = clamped / 12;
        int monthsIntoYear = clamped % 12;
        BigDecimal acc = BigDecimal.ZERO;
        for (int i = 0; i < fullYears && i < yearly.length; i++) {
            acc = acc.add(yearly[i]);
        }
        if (fullYears < yearly.length) {
            acc = acc.add(yearly[fullYears]
                    .divide(BigDecimal.valueOf(12), 12, RoundingMode.HALF_UP)
                    .multiply(BigDecimal.valueOf(monthsIntoYear)));
        }
        acc = acc.setScale(2, RoundingMode.HALF_UP);
        return acc.compareTo(cap) > 0 ? cap : acc;
    }

    /** 当期累计折旧 */
    public BigDecimal getAccumulated() {
        return accumulatedUntil(usedMonths);
    }

    /** 上期期末累计折旧（用于算期初净值） */
    public BigDecimal getOpeningAccumulated() {
        return accumulatedUntil(usedMonths - 1);
    }

    /** 净值 = 原值 − 累计折旧 */
    public BigDecimal getNetValue() {
        return originalValue.subtract(getAccumulated());
    }

    /** 期初净值 = 原值 − 上期累计折旧 */
    public BigDecimal getOpeningNetValue() {
        return originalValue.subtract(getOpeningAccumulated());
    }

    /** 剩余使用期限（月） */
    public int getRemainMonths() {
        return Math.max(0, totalMonths - usedMonths);
    }

    /** 月折旧率(%) = 月折旧额 / 原值 × 100 */
    public BigDecimal getRate() {
        if (originalValue.signum() == 0) {
            return BigDecimal.ZERO;
        }
        return monthly.multiply(BigDecimal.valueOf(100))
                .divide(originalValue, 4, RoundingMode.HALF_UP)
                .setScale(2, RoundingMode.HALF_UP);
    }

    public boolean isFinished() {
        return usedMonths >= totalMonths;
    }
}
