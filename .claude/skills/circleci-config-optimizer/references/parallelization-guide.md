# 並列化ガイド

## 並列化の種類

CircleCIには2つの並列化レベルがあります:

1. **ジョブレベル並列化** (`parallelism`)
   - 単一ジョブを複数コンテナで分割実行
   - テスト分割に最適

2. **ワークフローレベル並列化**
   - 複数の独立したジョブを同時実行
   - ビルド全体の高速化

## ジョブレベル並列化 (Test Splitting)

### 基本設定

```yaml
test:
  parallelism: 4
  docker:
    - image: cimg/ruby:3.0
  steps:
    - checkout
    - run:
        name: Run tests
        command: |
          circleci tests glob "spec/**/*_spec.rb" | \
          circleci tests split --split-by=timings | \
          xargs bundle exec rspec
```

### parallelism値の選び方

| テスト実行時間 | 推奨 parallelism | 効果 |
|-------------|----------------|-----|
| 5分未満 | 1-2 | 限定的 |
| 5-15分 | 2-4 | 中程度 |
| 15-30分 | 4-8 | 大きい |
| 30分以上 | 8-16 | 非常に大きい |

**コスト考慮:**
- parallelism=4 → コストは4倍
- しかし実行時間は通常 1/3 程度 (オーバーヘッドあり)
- 総コスト: 約 1.3倍でビルド時間を 1/3 に短縮

### 分割方法

#### 1. Timing-based (推奨)

```yaml
circleci tests glob "test/**/*.js" | \
circleci tests split --split-by=timings
```

**利点:**
- 過去の実行時間に基づいて最適に分割
- 最も均等な負荷分散

**前提条件:**
- 過去の実行履歴が必要
- store_test_results が設定されている

#### 2. Name-based

```yaml
circleci tests glob "test/**/*.js" | \
circleci tests split --split-by=name
```

**利点:**
- 履歴不要
- シンプル

**欠点:**
- ファイル名でソートするだけ
- 負荷が偏る可能性

#### 3. Filesize-based

```yaml
circleci tests glob "test/**/*.js" | \
circleci tests split --split-by=filesize
```

**利点:**
- ファイルサイズで分割
- やや均等

**欠点:**
- サイズと実行時間が比例しない場合に不適

## 言語別サンプル

### Ruby / RSpec

```yaml
test:
  parallelism: 4
  docker:
    - image: cimg/ruby:3.0
  steps:
    - checkout
    - restore_cache:
        keys:
          - v1-deps-{{ checksum "Gemfile.lock" }}
    - run: bundle install
    - run:
        name: Run tests
        command: |
          TESTFILES=$(circleci tests glob "spec/**/*_spec.rb" | \
                     circleci tests split --split-by=timings)
          bundle exec rspec $TESTFILES
    - store_test_results:
        path: test-results
```

### JavaScript / Jest

```yaml
test:
  parallelism: 4
  docker:
    - image: cimg/node:18.0
  steps:
    - checkout
    - restore_cache:
        keys:
          - v1-deps-{{ checksum "package-lock.json" }}
    - run: npm install
    - run:
        name: Run tests
        command: |
          TESTFILES=$(circleci tests glob "src/**/*.test.js" | \
                     circleci tests split --split-by=timings)
          npm test -- $TESTFILES
    - store_test_results:
        path: test-results
```

### Python / pytest

```yaml
test:
  parallelism: 4
  docker:
    - image: cimg/python:3.9
  steps:
    - checkout
    - restore_cache:
        keys:
          - v1-deps-{{ checksum "requirements.txt" }}
    - run: pip install -r requirements.txt
    - run:
        name: Run tests
        command: |
          TESTFILES=$(circleci tests glob "tests/**/test_*.py" | \
                     circleci tests split --split-by=timings)
          pytest $TESTFILES
    - store_test_results:
        path: test-results
```

### Go

```yaml
test:
  parallelism: 4
  docker:
    - image: cimg/go:1.20
  steps:
    - checkout
    - restore_cache:
        keys:
          - v1-go-{{ checksum "go.sum" }}
    - run: go mod download
    - run:
        name: Run tests
        command: |
          TESTFILES=$(go list ./... | \
                     circleci tests split --split-by=timings)
          go test -v $TESTFILES
    - store_test_results:
        path: test-results
```

## ワークフローレベル並列化

### 依存関係の明示

```yaml
workflows:
  version: 2
  build-test-deploy:
    jobs:
      # これらのジョブは並列実行される
      - lint
      - unit-test
      - integration-test
      
      # build は全テストの完了を待つ
      - build:
          requires:
            - lint
            - unit-test
            - integration-test
      
      # deploy は build の完了を待つ
      - deploy:
          requires:
            - build
```

### Fan-out / Fan-in パターン

```yaml
workflows:
  version: 2
  test-all:
    jobs:
      - checkout-code
      
      # Fan-out: 複数のテストを並列実行
      - test-frontend:
          requires:
            - checkout-code
      - test-backend:
          requires:
            - checkout-code
      - test-integration:
          requires:
            - checkout-code
      
      # Fan-in: 全テスト完了後にデプロイ
      - deploy:
          requires:
            - test-frontend
            - test-backend
            - test-integration
```

## パフォーマンス測定

### テスト結果の保存

```yaml
- run: npm test
- store_test_results:
    path: test-results
```

これにより:
- 次回の split --split-by=timings が正確になる
- CircleCI UI でテスト結果を可視化
- 失敗したテストの特定が容易

### Insights の活用

CircleCI UI の Insights タブで:
- ジョブごとの実行時間推移
- 並列化の効果測定
- ボトルネックの特定

## ベストプラクティス

### 1. 段階的に導入

```
parallelism: 1 → 2 → 4 → 8
```

各段階で効果とコストを測定

### 2. テストの独立性を確保

- データベースの状態を共有しない
- 一時ファイルの競合を避ける
- テスト順序に依存しない

### 3. セットアップ時間を最小化

```yaml
- restore_cache  # 依存関係キャッシュ
- run: bundle install --deployment
```

セットアップ時間が長いと並列化の効果が薄れる

### 4. 適切な分割粒度

- ファイル単位: 推奨
- テストクラス単位: OK
- 個別テスト単位: 細かすぎる (オーバーヘッド大)

## トラブルシューティング

### 並列化しても速くならない

原因:
1. セットアップ時間が支配的 → キャッシュ最適化
2. テストの依存関係問題 → テストの独立性を確保
3. リソース不足 → resource_class を上げる

### 負荷が偏る

対策:
1. split-by=timings を使用
2. store_test_results を確実に実行
3. 十分な履歴を蓄積 (10回以上)

### コストが高すぎる

判断基準:
- 実行時間短縮率 > 50% → 並列化維持
- 実行時間短縮率 < 30% → parallelism を減らす
- コスト vs 開発速度のトレードオフを評価

## 推定効果

### 例: 20分のテストスイート

| parallelism | 実行時間 | コスト係数 | 総コスト係数 |
|------------|---------|----------|-----------|
| 1 | 20分 | 1x | 20 |
| 2 | 12分 | 2x | 24 |
| 4 | 7分 | 4x | 28 |
| 8 | 4分 | 8x | 32 |

**最適解は組織による:**
- 高速フィードバック重視 → parallelism: 8
- コスト重視 → parallelism: 2-4
