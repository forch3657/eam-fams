package com.fams.module.depreciation;

import com.fams.common.ApiException;
import com.fams.common.ErrorCode;
import com.fams.common.R;
import com.fams.security.AuthContext;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

/**
 * 折旧计提端点（契约 5.8）。
 *
 * <p>{@code POST /api/depreciation/preview} 试算不落库，用于计提前确认金额；
 * {@code POST /api/depreciation/run} 执行计提，重写当期折旧明细 / 计划明细与折旧报表。</p>
 */
@RestController
@RequestMapping("/api/depreciation")
@RequiredArgsConstructor
public class DepreciationController {

    private static final String PERMISSION = "fa:depreciation";

    private final DepreciationService depreciationService;

    /** 折旧试算：只算不写 */
    @PostMapping("/preview")
    public R<DepreciationResult> preview(@RequestBody(required = false) Map<String, Object> body) {
        require();
        return R.ok(depreciationService.preview(periodOf(body)));
    }

    /** 执行折旧计提：写入明细与报表，同一 period 幂等 */
    @PostMapping("/run")
    public R<DepreciationResult> run(@RequestBody(required = false) Map<String, Object> body) {
        require();
        return R.ok(depreciationService.run(periodOf(body)));
    }

    /** 折旧计划明细查询（派生自计划明细集合） */
    @GetMapping("/plan")
    public R<Map<String, Object>> plan(@RequestParam(required = false) String month,
                                       @RequestParam(required = false) String keyword) {
        require();
        return R.ok(depreciationService.plan(month, keyword));
    }

    private static void require() {
        if (!AuthContext.hasPermission(PERMISSION)) {
            throw new ApiException(ErrorCode.FORBIDDEN, "无折旧计提权限：" + PERMISSION);
        }
    }

    private static String periodOf(Map<String, Object> body) {
        if (body == null) {
            return null;
        }
        Object period = body.get("period");
        return period == null ? null : String.valueOf(period);
    }
}
