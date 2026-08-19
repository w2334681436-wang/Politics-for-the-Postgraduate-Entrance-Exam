# 考研政治·史纲时间线

一个以横向时间线串联考研政治史纲知识点的静态学习系统。内容由仓库维护者提供的《27 徐涛强化班笔记——史纲》PDF 结构化生成。

## 功能

- 111 个考点与第十章说明完整收录
- 鼠标、触控板与触屏拖动浏览
- 年份、人物、事件与正文全文搜索，选择结果自动定位
- 完整知识点侧栏、章节快速跳转、缩放与键盘导航
- 本地记录“已学习”状态，无需账号与后端
- 纯静态资源，可直接部署到 Vercel

## 本地预览

```bash
npm run dev
```

打开 `http://localhost:4173`。

## 内容校验

```bash
npm run check:data
```

重新生成数据时，将 PDF 放在仓库相邻的 `upload` 目录，然后运行：

```bash
python3 scripts/build_content.py /path/to/史纲笔记.pdf
```

## Vercel

在 Vercel 导入本仓库即可。Framework Preset 选择 `Other`，无需构建命令，输出目录留空。
