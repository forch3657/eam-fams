package com.fams.engine;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.Arrays;
import java.util.Collections;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * D1 点测缺陷回归：固资单据编号按「全表」而非「当前可见列表」推算。
 *
 * <p>点测现象：派发单提示 code「FP20261000」已存在；生产库确实已有该单，
 * 而前端列表为空（受数据范围/筛选影响），genDocNo 从 1000 起又算出了同一个号。</p>
 */
class FixedDocCodeTest {

    @Test
    @DisplayName("已存在的编号按全表最大值 +1 重新生成")
    void skipsExistingCode() {
        assertThat(GenericService.nextFixedDocCode("FP2026", Arrays.asList("FP20261000")))
                .isEqualTo("FP20261001");
    }

    @Test
    @DisplayName("不可见的其它公司/部门编号也参与取最大值")
    void considersAllRowsNotOnlyVisible() {
        assertThat(GenericService.nextFixedDocCode("TK2026",
                Arrays.asList("TK20261000", "TK20261001", "TK20261002")))
                .isEqualTo("TK20261003");
    }

    @Test
    @DisplayName("空集合从 1000 起，保持既有编号格式")
    void startsAt1000() {
        assertThat(GenericService.nextFixedDocCode("JC2026", Collections.emptyList()))
                .isEqualTo("JC20261000");
    }

    @Test
    @DisplayName("其它年份与其它前缀不参与本年度取号")
    void ignoresOtherHeads() {
        assertThat(GenericService.nextFixedDocCode("FP2026",
                Arrays.asList("FP20251099", "TK20261050", "FP20261000")))
                .isEqualTo("FP20261001");
    }
}
