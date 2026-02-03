# キャッシュ戦略ガイド

## キャッシュの基本

CircleCIのキャッシュは依存関係のインストール時間を大幅に短縮します:
- 初回: 依存関係を完全インストール (3-5分)
- 以降: キャッシュから復元 (30秒-1分)
- **短縮率: 50-80%**

## 言語別ベストプラクティス

### Node.js / npm

```yaml
- restore_cache:
    keys:
      - v1-deps-{{ checksum "package-lock.json" }}
      - v1-deps-
- run: npm install
- save_cache:
    key: v1-deps-{{ checksum "package-lock.json" }}
    paths:
      - node_modules
```

**ポイント:**
- `package-lock.json` のチェックサムを使用
- フォールバックキー (`v1-deps-`) を設定
- `node_modules` をキャッシュ

### Node.js / Yarn

```yaml
- restore_cache:
    keys:
      - v1-deps-{{ checksum "yarn.lock" }}
      - v1-deps-
- run: yarn install --frozen-lockfile
- save_cache:
    key: v1-deps-{{ checksum "yarn.lock" }}
    paths:
      - node_modules
      - ~/.cache/yarn
```

**ポイント:**
- `yarn.lock` のチェックサムを使用
- Yarn のグローバルキャッシュも保存

### Ruby / Bundler

```yaml
- restore_cache:
    keys:
      - v1-gems-{{ checksum "Gemfile.lock" }}
      - v1-gems-
- run: bundle install --path vendor/bundle
- save_cache:
    key: v1-gems-{{ checksum "Gemfile.lock" }}
    paths:
      - vendor/bundle
```

**ポイント:**
- `Gemfile.lock` のチェックサムを使用
- `--path vendor/bundle` でローカルインストール

### Python / pip

```yaml
- restore_cache:
    keys:
      - v1-pip-{{ checksum "requirements.txt" }}
      - v1-pip-
- run: pip install -r requirements.txt
- save_cache:
    key: v1-pip-{{ checksum "requirements.txt" }}
    paths:
      - ~/.cache/pip
```

**ポイント:**
- `requirements.txt` のチェックサムを使用
- pip のキャッシュディレクトリを保存

### Python / Poetry

```yaml
- restore_cache:
    keys:
      - v1-poetry-{{ checksum "poetry.lock" }}
      - v1-poetry-
- run: poetry install
- save_cache:
    key: v1-poetry-{{ checksum "poetry.lock" }}
    paths:
      - ~/.cache/pypoetry
      - .venv
```

### Java / Gradle

```yaml
- restore_cache:
    keys:
      - v1-gradle-{{ checksum "build.gradle" }}-{{ checksum "gradle.properties" }}
      - v1-gradle-
- run: ./gradlew build
- save_cache:
    key: v1-gradle-{{ checksum "build.gradle" }}-{{ checksum "gradle.properties" }}
    paths:
      - ~/.gradle/caches
      - ~/.gradle/wrapper
```

### Java / Maven

```yaml
- restore_cache:
    keys:
      - v1-maven-{{ checksum "pom.xml" }}
      - v1-maven-
- run: mvn install -DskipTests
- save_cache:
    key: v1-maven-{{ checksum "pom.xml" }}
    paths:
      - ~/.m2/repository
```

### PHP / Composer

```yaml
- restore_cache:
    keys:
      - v1-composer-{{ checksum "composer.lock" }}
      - v1-composer-
- run: composer install --prefer-dist
- save_cache:
    key: v1-composer-{{ checksum "composer.lock" }}
    paths:
      - vendor
      - ~/.composer/cache
```

### Go / Modules

```yaml
- restore_cache:
    keys:
      - v1-go-{{ checksum "go.sum" }}
      - v1-go-
- run: go mod download
- save_cache:
    key: v1-go-{{ checksum "go.sum" }}
    paths:
      - ~/go/pkg/mod
```

## キャッシュキー設計

### 基本パターン

```yaml
- restore_cache:
    keys:
      - v1-deps-{{ checksum "lockfile" }}  # 完全一致
      - v1-deps-                           # 部分一致 (フォールバック)
```

### バージョン管理

キャッシュを無効化したい場合は v1 → v2 に変更:

```yaml
- restore_cache:
    keys:
      - v2-deps-{{ checksum "package-lock.json" }}
      - v2-deps-
```

### 複数ファイルのチェックサム

```yaml
- restore_cache:
    keys:
      - v1-{{ checksum "package-lock.json" }}-{{ checksum "yarn.lock" }}
```

### 環境変数の使用

```yaml
- restore_cache:
    keys:
      - v1-deps-{{ arch }}-{{ checksum "package-lock.json" }}
```

利用可能な変数:
- `{{ arch }}`: アーキテクチャ (x86_64, arm64等)
- `{{ .Branch }}`: ブランチ名
- `{{ .Revision }}`: Git commit SHA

## モノレポでのキャッシュ

### ワークスペース別キャッシュ

```yaml
- restore_cache:
    keys:
      - v1-frontend-{{ checksum "frontend/package-lock.json" }}
- restore_cache:
    keys:
      - v1-backend-{{ checksum "backend/Gemfile.lock" }}
```

### ルートとサブディレクトリ

```yaml
- restore_cache:
    keys:
      - v1-root-{{ checksum "package-lock.json" }}-{{ checksum "packages/*/package.json" }}
```

## トラブルシューティング

### キャッシュが効いていない

原因と対策:
1. **キーが毎回変わる**: チェックサムの対象ファイルを確認
2. **パスが間違っている**: キャッシュ対象のパスを確認
3. **キャッシュが削除された**: 最大保存期間15日、LRUで削除

### キャッシュサイズが大きすぎる

対策:
- 不要なファイルを除外 (例: `node_modules/.cache`)
- 複数の小さいキャッシュに分割
- 圧縮を有効化 (デフォルトで有効)

### キャッシュの復元が遅い

対策:
- キャッシュサイズを削減
- ネットワーク転送量を削減
- 並列ジョブでキャッシュを共有

## ベストプラクティスまとめ

1. **常にロックファイルのチェックサムを使用**
2. **フォールバックキーを設定**
3. **バージョンプレフィックスを使用 (v1-)**
4. **最小限のパスのみキャッシュ**
5. **定期的にキャッシュを更新 (バージョン変更)**
