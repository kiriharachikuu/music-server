import TinyPinyin = require('tiny-pinyin');

const { convertToPinyin } = TinyPinyin;

/**
 * 工具：把任意文本转换为"拼音首字母"字符串
 *
 * 规则：
 * - 汉字：取该字全拼的首字母（不含声调）
 * - 拉丁字母 / 数字：保留原字符（小写）
 * - 其它字符：丢弃
 *
 * 示例：
 *   "星镜境"     => "xjj"
 *   "Hello 世界" => "helloworld"
 *   "abc"        => "abc"
 *   "X-1 测试"   => "x1cs"
 */
export function toPinyinInitials(text: string): string {
  if (!text) return '';

  let result = '';
  for (const ch of text) {
    // 已经是 a-z / 0-9：原样小写保留
    if (/[a-z0-9]/i.test(ch)) {
      result += ch.toLowerCase();
      continue;
    }
    // 汉字：CJK 基本区 + 扩展 A 范围
    if (/[一-鿿]/.test(ch)) {
      // convertToPinyin 返回该字全拼（不含分隔符/小写），例如 "星" => "xing"
      // 对于 tiny-pinyin 不支持的字（例如生僻字），convertToPinyin 会原样返回原字符；
      // 这种情况我们直接丢弃，避免噪音。
      const py: string = convertToPinyin(ch, '', true);
      const initial = py.replace(/[^a-z]/g, '').charAt(0);
      if (initial) result += initial;
      continue;
    }
    // 其它字符（标点、空格等）丢弃
  }
  return result;
}
