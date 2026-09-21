// 模块级 ref 注册/调用 delete handler，
// 避免把 setEdges 通过 edge.data 传递（data 会参与 JSON 序列化）。
let handler = null;

export const setEdgeDeleteHandler = (fn) => {
  handler = fn;
};

export const deleteEdge = (id) => {
  if (handler) handler(id);
};
