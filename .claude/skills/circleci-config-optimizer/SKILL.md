---
name: circleci-config-optimizer
description: "Analyzes CircleCI configuration files (config.yml) and provides optimization recommendations based on best practices. Use when (1) User mentions 'optimize config.yml', 'improve CircleCI setup', or 'review CircleCI configuration', (2) User wants to reduce build costs, execution time, or credit consumption, (3) User asks about resource_class settings, caching strategies, parallelization, or Docker Layer Caching, (4) User mentions CircleCI performance issues like 'builds are slow' or 'tests take too long', (5) User requests best practices check or wants to identify anti-patterns. Performs static analysis of resource_class optimization, cache strategy evaluation, parallelization opportunities, Docker Layer Caching configuration, Orbs utilization, workflow structure, and general best practices. DO NOT use for other CI/CD tools (GitHub Actions, Jenkins, GitLab CI), Dockerfile optimization, CircleCI account management, or Orbs development."
---

# CircleCI Config Optimizer

このSkillは、CircleCIの設定ファイル(`.circleci/config.yml`)を静的解析し、ベストプラクティスに基づいた改善提案を提供します。

## 実行フロー

スキルがトリガーされたら、以下の順序で実行:

### 1. ファイルパスの確認

ユーザーにconfig.ymlのパスを確認します。指定がない場合は `.circleci/config.yml` をデフォルトとします。

### 2. スクリプトの実行

TypeScriptスクリプトを実行して分析を開始:

```bash
cd /mnt/skills/user/circleci-config-optimizer
npx tsx optimize-config.ts <path-to-config.yml>
```

パスが指定されていない場合:
```bash
npx tsx optimize-config.ts
```

### 3. 結果の提示

スクリプトが生成したマークダウンレポートをユーザーに提示します。レポートには以下が含まれます:

- 検出された問題点(優先度順)
- 各問題の詳細説明
- 具体的なYAML設定変更例
- 推定されるコスト削減率と時間短縮
- 実装推奨順序

### 4. フォローアップ

必要に応じて:
- 特定の提案について詳しく説明
- 実装方法の具体的なガイダンス
- 追加の最適化オプションの提示

## 分析項目

スクリプトは以下の項目を自動的にチェックします:

### リソース最適化
- 各ジョブのresource_class設定を評価
- 実行時間に対して過剰なリソースを検出
- コスト削減の推定値を計算

### キャッシュ戦略
- 依存関係キャッシュの有無を確認
- 言語・フレームワークを自動検出
- 適切なキャッシュキー設計を提案

### 並列化
- テストジョブでのparallelism設定をチェック
- ワークフロー内の並列実行機会を検出
- 時間短縮の推定値を計算

### Docker Layer Caching
- Dockerビルドステップを検出
- dlc: true 設定の有無を確認

### Orbs活用
- 手動実装されているツールを検出
- 対応する公式Orbsを提案

### ワークフロー構造
- ジョブ間の依存関係を分析
- 不要な直列化を検出

### ベストプラクティス
- 環境変数の使用状況
- 承認ステップの配置
- フィルター設定の妥当性

## エラーハンドリング

スクリプトは以下のエラーを適切にハンドリングします:

- **ファイルが見つからない**: 明確なエラーメッセージと正しいパスの指定方法を提示
- **YAML構文エラー**: 問題箇所(行番号・列番号)を特定
- **CircleCIバージョン不一致**: サポートされているバージョン(2.1)を通知
- **一部の分析失敗**: 失敗した分析を警告し、他の分析は継続

## 注意事項

- このSkillは**静的解析のみ**を実行します(外部API呼び出しなし)
- 実際のビルドメトリクス(実行時間、コスト)にアクセスできないため、推定値は仮定に基づきます
- 推定値はベンチマークとして使用し、実装後に実測値を確認してください

## 参考資料

詳細なベストプラクティスについては、`references/` ディレクトリ内のドキュメントを参照:

- `resource-class-guide.md`: リソースクラスの詳細
- `cache-strategies.md`: 言語別キャッシュ戦略
- `parallelization-guide.md`: 並列化の実装ガイド
- `best-practices-checklist.md`: 包括的なチェックリスト
