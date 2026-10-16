/** 将页码限制在有效范围，并返回当前页及显示的记录区间。 */
export function paginate<T>(records: T[], requestedPage: number, pageSize: number): {
  items: T[]; page: number; pages: number; start: number; end: number;
} {
  const pages = Math.max(1, Math.ceil(records.length / pageSize));
  const page = Math.min(Math.max(1, requestedPage), pages);
  const offset = (page - 1) * pageSize;
  return {
    items: records.slice(offset, offset + pageSize), page, pages,
    start: records.length ? offset + 1 : 0,
    end: Math.min(records.length, offset + pageSize),
  };
}
