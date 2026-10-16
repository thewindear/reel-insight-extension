/** 从文案中提取去重后的标签、提及和链接。 */
export function captionEntities(caption: string): { tags: string[]; mentions: string[]; links: string[] } {
  const links = [...caption.matchAll(/(?:https?:\/\/|www\.)[^\s<>"'，。！？、]+/giu)]
    .map(match => match[0].replace(/[.,;:!?)]*$/u, ''));
  // 先移除 URL，避免把网址中的 @ 或 # 误当成提及和标签。
  const withoutLinks = links.reduce((text, link) => text.replace(link, ' '), caption);
  return {
    tags: [...new Set([...withoutLinks.matchAll(/(^|[^\p{L}\p{N}_])#([\p{L}\p{N}_]+)/gu)].map(match => match[2]!))],
    mentions: [...new Set([...withoutLinks.matchAll(/(^|[^\p{L}\p{N}_.])@([A-Za-z0-9._]+)/gu)].map(match => match[2]!))],
    links: [...new Set(links.map(link => link.startsWith('www.') ? `https://${link}` : link))],
  };
}
