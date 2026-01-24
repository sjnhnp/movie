// 提取核心标题，用于匹配同一作品的不同版本，移除多余的标签和集数信息
function getCoreTitle(title, typeName = '') {
    if (typeof title !== 'string') {
        return '';
    }

    let baseName = title;

    // 步骤 1: 使用正则表达式，仅对电影类型移除副标题
    const movieKeywords = [
        '电影', '剧情', '动作', '冒险', '同性', '喜剧', '奇幻',
        '恐怖', '悬疑', '惊悚', '灾难', '爱情', '犯罪', '科幻', '抢先',
        '动画', '歌舞', '战争', '经典', '网络', '其它', '理论', '纪录'
    ];
    const movieRegex = new RegExp(movieKeywords.join('|'));
    if (typeName && movieRegex.test(typeName)) {
        baseName = baseName.replace(/[:：].*/, '').trim();
    }

    // 步骤 2: 提取并统一季数
    const numeralMap = { '一': '1', '二': '2', '三': '3', '四': '4', '五': '5', '六': '6', '七': '7', '八': '8', '九': '9', '十': '10' };
    let normalizedTitle = title.replace(/[一二三四五六七八九十]/g, (match) => numeralMap[match]);

    let seasonNumber = 1;
    const seasonMatch = normalizedTitle.match(/(?:第|Season\s*)(\d+)[季部]/i);
    if (seasonMatch) {
        seasonNumber = parseInt(seasonMatch[1], 10);
    }
    const seasonIdentifier = `_S${String(seasonNumber).padStart(2, '0')}`;

    // 步骤 3: 从基础名称中移除所有版本和季数标签，得到纯净的剧名
    const seasonRegex = new RegExp('[\\s\\(（【\\[]?(?:第[一二三四五六七八九十\\d]+[季部]|Season\\s*\\d+)[\\)）】\\]]?', 'gi');
    baseName = baseName.replace(seasonRegex, '').trim();

    const versionTags = ['国语', '国', '粤语', '粤', '台配', '台', '中字', '普通话', '高清', 'HD', '版', '修复版', 'TC', '蓝光', '4K'];
    const bracketRegex = new RegExp(`[\\s\\(（【\\[](${versionTags.join('|')})(?![0-9])\\s*[\\)）】\\]]?`, 'gi');
    baseName = baseName.replace(bracketRegex, '').trim();
    const suffixRegex = new RegExp(`(${versionTags.join('|')})$`, 'i');
    baseName = baseName.replace(suffixRegex, '').trim();

    baseName = baseName.replace(/\s+/g, '').trim();

    // 步骤 4: 使用正确的变量 `movieRegex` 来进行判断
    if (typeName && movieRegex.test(typeName) && !seasonMatch) {
        return baseName;
    }

    return `${baseName}${seasonIdentifier}`;
}