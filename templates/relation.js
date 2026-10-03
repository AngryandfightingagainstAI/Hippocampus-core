// ============================================================
// 数值模板 · 关系（relation）
// ============================================================

window.TEMPLATE_RELATION = {
  type: "relation",
  from: "player",     // 从谁
  to: "",             // 对谁
  label: "",          // 关系名称（可 AI 动态修改）
  icon: "●",
  min: -100,
  max: 100,
  init: 0,
  showBar: true,
  color: "blue",
  desc: "",           // 总说明
  segments: [],       // 分段说明
  lockDown: false,    // 禁止好感下降
  lockUp: false,      // 禁止好感提升
  where: "panel.social"
};