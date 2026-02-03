# Resource Class ガイド

## リソースクラスとコスト

CircleCIの各リソースクラスには以下のクレジット単価が適用されます:

| Resource Class | CPU | RAM | Credits/分 |
|---------------|-----|-----|-----------|
| small | 1 | 2GB | 5 |
| medium | 2 | 4GB | 10 |
| large | 4 | 8GB | 20 |
| xlarge | 8 | 16GB | 40 |
| 2xlarge | 16 | 32GB | 80 |

## 選択ガイドライン

### Small (1 CPU, 2GB RAM)
**適している用途:**
- 軽量なリンター実行 (ESLint, Rubocop等)
- 型チェック (TypeScript, Flowなど)
- 単純なビルド (静的サイト生成等)
- 短時間のスクリプト実行

**推定実行時間**: 1-3分

### Medium (2 CPU, 4GB RAM) - デフォルト
**適している用途:**
- 標準的な単体テスト
- 中規模アプリケーションのビルド
- 依存関係のインストール
- 標準的なデプロイスクリプト

**推定実行時間**: 3-10分

### Large (4 CPU, 8GB RAM)
**適している用途:**
- 統合テスト・E2Eテスト
- 大規模アプリケーションのビルド
- Dockerイメージビルド
- メモリ集約的な処理

**推定実行時間**: 10-20分

### XLarge / 2XLarge
**適している用途:**
- 非常に大規模なビルド
- 複雑な統合テストスイート
- 並列テスト実行 (parallelism併用)
- 高メモリ要求のある処理

**推定実行時間**: 20分以上

## 最適化のベストプラクティス

### 1. ジョブの性質を分析

各ジョブが何をしているかを確認:
- CPU集約的か? → 大きいリソースクラス
- メモリ集約的か? → 大きいリソースクラス
- I/O待ちが多い? → 小さいリソースクラスで十分

### 2. 実行時間を測定

実際のビルドログから実行時間を確認:
- 5分未満 → small または medium を検討
- 5-15分 → medium または large を検討
- 15分以上 → large または xlarge を検討

### 3. 段階的に最適化

1. デフォルト(medium)で実行
2. 実行時間とリソース使用率を確認
3. 過剰な場合は小さく、不足な場合は大きく調整
4. 再測定

### 4. コスト計算

例: テストジョブが平均7分、月100回実行する場合

**Medium使用時:**
- 7分 × 10 credits/分 = 70 credits/回
- 70 credits × 100回 = 7,000 credits/月

**Small使用時 (3分で完了する場合):**
- 3分 × 5 credits/分 = 15 credits/回
- 15 credits × 100回 = 1,500 credits/月
- **削減: 5,500 credits/月 (78%)**

## Machine / macOS Executor

Dockerとは異なるリソースクラス体系:

### Machine Executor
- medium: 2 CPU, 7.5GB RAM
- large: 4 CPU, 15GB RAM
- x-large: 8 CPU, 32GB RAM

### macOS Executor
- medium: 4 CPU, 8GB RAM
- large: 8 CPU, 16GB RAM
- macos.x86.large: Intel専用
- macos.m1.medium/large: Apple Silicon

## トラブルシューティング

### OOM (Out of Memory) エラー
→ 大きいresource_classを試す、またはメモリ使用を最適化

### タイムアウト
→ 大きいresource_classでCPU性能向上、または並列化

### コストが高い
→ 実行時間と resource_class のバランスを見直す
