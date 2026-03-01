---
alwaysApply: false
globs: *.tsx
---
# 禁止在 useEffect 内同步直接调用 setState
* 错误：useEffect 里直接写 setXxx()
* 正确：仅在异步回调/事件监听中调用 setState；同步场景移除 useEffect，直接初始化/计算状态