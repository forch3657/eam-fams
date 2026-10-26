package com.fams.engine;

import com.fams.common.ApiException;
import com.fams.common.ErrorCode;
import com.fams.common.PageResult;
import com.fams.common.R;
import com.fams.security.AuthContext;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import javax.servlet.http.HttpServletRequest;
import java.util.List;
import java.util.Map;

/**
 * 契约 1.3 的 8 个通用端点：一套实现服务全部 31+ 个集合。
 *
 * <p>路径约定：{@code /api/{key}}、{@code /api/{key}/page}、{@code /api/{key}/{id}}、
 * 批量 {@code PUT /api/{key}/batch}、清空 {@code DELETE /api/{key}/all}。</p>
 *
 * <p>字面量路径（page / batch / all）优先级高于 {@code {id}} 通配，
 * 因此不会与主键为这些名字的记录冲突。</p>
 */
@Slf4j
@RestController
@RequestMapping("/api/{key}")
@RequiredArgsConstructor
public class GenericController {

    private final GenericService genericService;

    private final PermissionPolicy permissionPolicy;

    /** 列表查询（不分页，带上限保护） */
    @GetMapping
    public R<List<Map<String, Object>>> list(@PathVariable("key") String key, HttpServletRequest request) {
        require(key, "GET");
        return R.ok(genericService.list(key, request.getParameterMap()));
    }

    /** 分页查询 */
    @GetMapping("/page")
    public R<PageResult> page(@PathVariable("key") String key, HttpServletRequest request) {
        require(key, "GET");
        return R.ok(genericService.page(key, request.getParameterMap()));
    }

    /** 详情 */
    @GetMapping("/{id}")
    public R<Map<String, Object>> detail(@PathVariable("key") String key, @PathVariable("id") String id) {
        require(key, "GET");
        return R.ok(genericService.get(key, id));
    }

    /** 新增 */
    @PostMapping
    public R<Map<String, Object>> create(@PathVariable("key") String key,
                                        @RequestBody(required = false) Map<String, Object> body) {
        require(key, "POST");
        return R.ok(genericService.create(key, body));
    }

    /** 全量替换更新 */
    @PutMapping("/{id}")
    public R<Map<String, Object>> update(@PathVariable("key") String key, @PathVariable("id") String id,
                                         @RequestBody(required = false) Map<String, Object> body) {
        require(key, "PUT");
        return R.ok(genericService.update(key, id, body));
    }

    /** 删除（含删除保护与库存回退） */
    @DeleteMapping("/{id}")
    public R<Boolean> remove(@PathVariable("key") String key, @PathVariable("id") String id) {
        require(key, "DELETE");
        return R.ok(genericService.remove(key, id));
    }

    /** 批量保存（按主键 upsert） */
    @PutMapping("/batch")
    public R<List<Map<String, Object>>> batch(@PathVariable("key") String key,
                                              @RequestBody(required = false) List<Map<String, Object>> rows) {
        require(key, "PUT");
        return R.ok(genericService.batch(key, rows));
    }

    /** 清空集合 */
    @DeleteMapping("/all")
    public R<Boolean> clear(@PathVariable("key") String key) {
        require(key, "DELETE");
        return R.ok(genericService.clear(key));
    }

    /** 按钮级权限：与前端 36 个权限码对齐 */
    private void require(String key, String method) {
        if (!permissionPolicy.matches(key, method, AuthContext.granted())) {
            throw new ApiException(ErrorCode.FORBIDDEN, "无权限访问该数据：" + key);
        }
    }
}
