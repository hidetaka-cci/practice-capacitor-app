#!/usr/bin/env node
/**
 * CircleCI Config Optimizer
 * 
 * Analyzes CircleCI configuration files and provides optimization recommendations
 * based on best practices.
 */

import * as fs from 'fs';
import * as yaml from 'js-yaml';
import * as path from 'path';

// ============================================================================
// Type Definitions
// ============================================================================

type Priority = 'high' | 'medium' | 'low';
type Category = 'resource' | 'cache' | 'parallel' | 'dlc' | 'orbs' | 'workflow' | 'practice';

interface Issue {
  id: string;
  category: Category;
  priority: Priority;
  impactScore: number;
  title: string;
  currentState: string;
  problem: string;
  recommendation: string;
  codeExample?: string;
  estimatedSavings?: {
    costReduction?: string;
    timeReduction?: string;
  };
  affectedJobs?: string[];
}

interface AnalysisResult {
  totalIssues: number;
  highPriority: number;
  mediumPriority: number;
  lowPriority: number;
  estimatedMonthlySavings: {
    costReduction: string;
    timeReduction: string;
  };
  issues: Issue[];
}

// ============================================================================
// Constants
// ============================================================================

const RESOURCE_CLASS_CREDITS: Record<string, number> = {
  'small': 5,
  'medium': 10,
  'large': 20,
  'xlarge': 40,
  '2xlarge': 80,
};

const DEFAULT_JOB_DURATION_MINUTES = 10;

// ============================================================================
// Main Function
// ============================================================================

function main() {
  try {
    // Get config path from command line or use default
    const configPath = process.argv[2] || '.circleci/config.yml';
    
    console.log(`\n🔍 Analyzing CircleCI configuration: ${configPath}\n`);
    
    // Read and parse config file
    const config = loadConfig(configPath);
    
    // Run all analyses
    const issues: Issue[] = [];
    
    issues.push(...safeAnalyze(() => analyzeResourceClasses(config), 'Resource class'));
    issues.push(...safeAnalyze(() => analyzeCacheStrategy(config), 'Cache strategy'));
    issues.push(...safeAnalyze(() => analyzeParallelization(config), 'Parallelization'));
    issues.push(...safeAnalyze(() => analyzeDockerLayerCaching(config), 'Docker Layer Caching'));
    issues.push(...safeAnalyze(() => analyzeOrbsOpportunities(config), 'Orbs'));
    issues.push(...safeAnalyze(() => analyzeWorkflowStructure(config), 'Workflow structure'));
    issues.push(...safeAnalyze(() => analyzeBestPractices(config), 'Best practices'));
    
    // Sort issues by priority and impact
    issues.sort((a, b) => {
      const priorityOrder = { high: 0, medium: 1, low: 2 };
      const priorityDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
      if (priorityDiff !== 0) return priorityDiff;
      return b.impactScore - a.impactScore;
    });
    
    // Generate and display report
    const result: AnalysisResult = {
      totalIssues: issues.length,
      highPriority: issues.filter(i => i.priority === 'high').length,
      mediumPriority: issues.filter(i => i.priority === 'medium').length,
      lowPriority: issues.filter(i => i.priority === 'low').length,
      estimatedMonthlySavings: calculateTotalSavings(issues),
      issues,
    };
    
    displayReport(result, configPath);
    
  } catch (error) {
    if (error instanceof Error) {
      console.error(`\n❌ Error: ${error.message}\n`);
    } else {
      console.error(`\n❌ Unexpected error occurred\n`);
    }
    process.exit(1);
  }
}

// ============================================================================
// Config Loading and Validation
// ============================================================================

function loadConfig(configPath: string): any {
  // Check if file exists
  if (!fs.existsSync(configPath)) {
    throw new Error(
      `Config file not found: ${configPath}\n` +
      `Please specify the correct path or ensure the file exists.\n` +
      `Usage: npx tsx optimize-config.ts <path-to-config.yml>`
    );
  }
  
  // Read file
  let fileContent: string;
  try {
    fileContent = fs.readFileSync(configPath, 'utf8');
  } catch (error: any) {
    if (error.code === 'EACCES') {
      throw new Error(`Permission denied reading ${configPath}`);
    }
    throw new Error(`Error reading file: ${error.message}`);
  }
  
  // Parse YAML
  let config: any;
  try {
    config = yaml.load(fileContent);
  } catch (error: any) {
    let errorMsg = 'Invalid YAML syntax';
    if (error.mark) {
      errorMsg += `\n  at line ${error.mark.line + 1}, column ${error.mark.column + 1}`;
      errorMsg += `\n  ${error.reason}`;
    }
    errorMsg += '\n\nPlease fix the YAML syntax and try again.';
    throw new Error(errorMsg);
  }
  
  // Basic structure validation
  if (!config || typeof config !== 'object') {
    throw new Error('Invalid config file: Not a valid YAML object');
  }
  
  if (!config.jobs || Object.keys(config.jobs).length === 0) {
    throw new Error(
      'No jobs defined in config.yml\n' +
      'This does not appear to be a valid CircleCI 2.1 configuration.'
    );
  }
  
  return config;
}

// ============================================================================
// Analysis Functions
// ============================================================================

function analyzeResourceClasses(config: any): Issue[] {
  const issues: Issue[] = [];
  
  if (!config.jobs) return issues;
  
  for (const [jobName, jobDef] of Object.entries<any>(config.jobs)) {
    const executor = detectExecutor(jobDef);
    if (executor !== 'docker') continue; // Only analyze docker executors
    
    const resourceClass = jobDef.resource_class || 'medium';
    const estimatedTime = estimateJobDuration(jobDef.steps || []);
    
    // Check for oversized resource class on short jobs
    if (estimatedTime < 5 && ['large', 'xlarge', '2xlarge'].includes(resourceClass)) {
      const currentCredits = RESOURCE_CLASS_CREDITS[resourceClass] * estimatedTime;
      const recommendedClass = estimatedTime < 3 ? 'small' : 'medium';
      const recommendedCredits = RESOURCE_CLASS_CREDITS[recommendedClass] * estimatedTime;
      const savingsPercent = Math.round((1 - recommendedCredits / currentCredits) * 100);
      
      issues.push({
        id: `resource-${jobName}`,
        category: 'resource',
        priority: 'high',
        impactScore: 80 + savingsPercent / 5,
        title: `${jobName}: resource_class が過剰`,
        currentState: `resource_class: ${resourceClass}`,
        problem: `推定実行時間${estimatedTime}分に対して${resourceClass}は過剰です`,
        recommendation: `${recommendedClass} に変更を検討してください`,
        codeExample: `${jobName}:\n  docker:\n    - image: ${getImageFromJob(jobDef)}\n  resource_class: ${recommendedClass}  # ${resourceClass} から変更`,
        estimatedSavings: {
          costReduction: `${savingsPercent}% (${currentCredits - recommendedCredits} credits/実行)`,
        },
        affectedJobs: [jobName],
      });
    }
    
    // Check for unspecified resource_class
    if (!jobDef.resource_class) {
      issues.push({
        id: `resource-unspecified-${jobName}`,
        category: 'resource',
        priority: 'low',
        impactScore: 30,
        title: `${jobName}: resource_class 未指定`,
        currentState: 'resource_class なし (デフォルト: medium)',
        problem: 'デフォルトのmediumが使用されますが、明示的な指定が推奨されます',
        recommendation: 'ジョブの性質に応じて適切なresource_classを明示的に指定',
        codeExample: `${jobName}:\n  docker:\n    - image: ${getImageFromJob(jobDef)}\n  resource_class: medium  # または small/large`,
        affectedJobs: [jobName],
      });
    }
  }
  
  return issues;
}

function analyzeCacheStrategy(config: any): Issue[] {
  const issues: Issue[] = [];
  
  if (!config.jobs) return issues;
  
  for (const [jobName, jobDef] of Object.entries<any>(config.jobs)) {
    const steps = jobDef.steps || [];
    
    const hasRestoreCache = steps.some((s: any) => s.restore_cache || s['restore_cache']);
    const hasSaveCache = steps.some((s: any) => s.save_cache || s['save_cache']);
    const hasDepInstall = detectDependencyInstall(steps);
    
    // Check for missing cache on dependency installation
    if (hasDepInstall && !hasRestoreCache) {
      const language = detectLanguage(jobDef);
      const cacheExample = generateCacheExample(language);
      
      issues.push({
        id: `cache-missing-${jobName}`,
        category: 'cache',
        priority: 'high',
        impactScore: 80,
        title: `${jobName}: キャッシュ未設定`,
        currentState: 'キャッシュなし',
        problem: '依存関係を毎回インストールしているため時間がかかります',
        recommendation: `${language}の依存関係キャッシュを追加してください`,
        codeExample,
        estimatedSavings: {
          timeReduction: '2-3分/ビルド',
        },
        affectedJobs: [jobName],
      });
    }
    
    // Check cache key quality
    if (hasRestoreCache) {
      const restoreCacheStep = steps.find((s: any) => s.restore_cache || s['restore_cache']);
      const cacheKeys = restoreCacheStep?.restore_cache?.keys || 
                       restoreCacheStep?.['restore_cache']?.keys || [];
      
      const hasChecksum = cacheKeys.some((key: string) => key.includes('checksum'));
      
      if (!hasChecksum) {
        issues.push({
          id: `cache-key-${jobName}`,
          category: 'cache',
          priority: 'medium',
          impactScore: 50,
          title: `${jobName}: キャッシュキーにチェックサムなし`,
          currentState: `キー: ${cacheKeys.join(', ')}`,
          problem: 'ロックファイルのチェックサムがないため、依存関係の変更を正確に検出できません',
          recommendation: 'ロックファイルのチェックサムをキーに含めてください',
          codeExample: `- restore_cache:\n    keys:\n      - v1-deps-{{ checksum "package-lock.json" }}\n      - v1-deps-`,
          affectedJobs: [jobName],
        });
      }
    }
  }
  
  return issues;
}

function analyzeParallelization(config: any): Issue[] {
  const issues: Issue[] = [];
  
  if (!config.jobs) return issues;
  
  // Job-level parallelism
  for (const [jobName, jobDef] of Object.entries<any>(config.jobs)) {
    if (isTestJob(jobName, jobDef) && !jobDef.parallelism) {
      issues.push({
        id: `parallel-job-${jobName}`,
        category: 'parallel',
        priority: 'medium',
        impactScore: 70,
        title: `${jobName}: テストの並列化なし`,
        currentState: 'parallelism 未設定',
        problem: 'テストを並列実行していないため、時間がかかります',
        recommendation: 'parallelism を設定してテストを分割実行してください',
        codeExample: `${jobName}:\n  parallelism: 4\n  steps:\n    - run: |\n        circleci tests glob "test/**/*_test.rb" | \\\n        circleci tests split --split-by=timings`,
        estimatedSavings: {
          timeReduction: '40-50%',
        },
        affectedJobs: [jobName],
      });
    }
  }
  
  // Workflow-level parallelization
  if (config.workflows) {
    for (const [wfName, wfDef] of Object.entries<any>(config.workflows)) {
      const jobs = wfDef.jobs || [];
      const parallelOpportunities = findParallelOpportunities(jobs);
      
      if (parallelOpportunities.length > 0) {
        issues.push({
          id: `parallel-workflow-${wfName}`,
          category: 'workflow',
          priority: 'medium',
          impactScore: 60,
          title: `${wfName}: ワークフローの並列化機会あり`,
          currentState: `${parallelOpportunities.length}個のジョブが不必要に直列実行`,
          problem: '依存関係のないジョブが直列実行されています',
          recommendation: 'これらのジョブを並列実行してください',
          codeExample: `workflows:\n  ${wfName}:\n    jobs:\n      ${parallelOpportunities.map(j => `- ${j}`).join('\n      ')}\n      # これらのジョブは並列実行可能`,
          estimatedSavings: {
            timeReduction: `${Math.min(parallelOpportunities.length * 2, 10)}分/ビルド`,
          },
        });
      }
    }
  }
  
  return issues;
}

function analyzeDockerLayerCaching(config: any): Issue[] {
  const issues: Issue[] = [];
  
  if (!config.jobs) return issues;
  
  for (const [jobName, jobDef] of Object.entries<any>(config.jobs)) {
    const steps = jobDef.steps || [];
    
    const hasDockerBuild = steps.some((s: any) => 
      typeof s.run === 'string' && s.run.includes('docker build') ||
      typeof s.run === 'object' && s.run.command?.includes('docker build')
    );
    
    const setupRemoteDocker = steps.find((s: any) => s.setup_remote_docker || s['setup_remote_docker']);
    const hasDLC = setupRemoteDocker?.setup_remote_docker?.docker_layer_caching === true ||
                  setupRemoteDocker?.['setup_remote_docker']?.docker_layer_caching === true;
    
    if (hasDockerBuild && !hasDLC) {
      issues.push({
        id: `dlc-${jobName}`,
        category: 'dlc',
        priority: 'medium',
        impactScore: 65,
        title: `${jobName}: Docker Layer Caching 未設定`,
        currentState: 'DLC なし',
        problem: 'Dockerイメージを毎回フルビルドしているため時間がかかります',
        recommendation: 'Docker Layer Caching を有効にしてください',
        codeExample: `- setup_remote_docker:\n    docker_layer_caching: true`,
        estimatedSavings: {
          timeReduction: '3-5分/ビルド',
        },
        affectedJobs: [jobName],
      });
    }
  }
  
  return issues;
}

function analyzeOrbsOpportunities(config: any): Issue[] {
  const issues: Issue[] = [];
  
  // Common patterns that could use Orbs
  const orbOpportunities = [
    {
      pattern: /aws\s+(s3|ecr|ecs|cloudformation)/i,
      orb: 'circleci/aws-cli@4.0',
      name: 'AWS CLI',
    },
    {
      pattern: /slack/i,
      orb: 'circleci/slack@4.0',
      name: 'Slack通知',
    },
    {
      pattern: /npm\s+install|yarn\s+install/,
      orb: 'circleci/node@5.0',
      name: 'Node.js',
    },
  ];
  
  if (!config.jobs) return issues;
  
  for (const [jobName, jobDef] of Object.entries<any>(config.jobs)) {
    const steps = jobDef.steps || [];
    const stepsStr = JSON.stringify(steps);
    
    for (const { pattern, orb, name } of orbOpportunities) {
      if (pattern.test(stepsStr)) {
        const orbsInUse = config.orbs || {};
        if (!Object.values(orbsInUse).some((o: any) => o.includes(orb.split('@')[0]))) {
          issues.push({
            id: `orbs-${jobName}-${name.replace(/\s+/g, '-')}`,
            category: 'orbs',
            priority: 'low',
            impactScore: 40,
            title: `${jobName}: ${name} Orb の活用`,
            currentState: '手動実装',
            problem: `${name}関連の処理が手動実装されています`,
            recommendation: `${orb} Orb の使用を検討してください`,
            codeExample: `orbs:\n  ${name.toLowerCase().replace(/\s+/g, '-')}: ${orb}`,
            affectedJobs: [jobName],
          });
        }
      }
    }
  }
  
  return issues;
}

function analyzeWorkflowStructure(config: any): Issue[] {
  const issues: Issue[] = [];
  
  if (!config.workflows) return issues;
  
  for (const [wfName, wfDef] of Object.entries<any>(config.workflows)) {
    const jobs = wfDef.jobs || [];
    
    // Check for approval steps
    const hasApproval = jobs.some((j: any) => j.type === 'approval' || j === 'approval');
    if (!hasApproval && jobs.length > 3) {
      issues.push({
        id: `workflow-approval-${wfName}`,
        category: 'workflow',
        priority: 'low',
        impactScore: 30,
        title: `${wfName}: 承認ステップなし`,
        currentState: '承認ステップなし',
        problem: 'デプロイ前の手動承認がないため、意図しないデプロイのリスクがあります',
        recommendation: '本番デプロイ前に承認ステップを追加してください',
        codeExample: `- hold:\n    type: approval\n    requires:\n      - test\n- deploy:\n    requires:\n      - hold`,
      });
    }
  }
  
  return issues;
}

function analyzeBestPractices(config: any): Issue[] {
  const issues: Issue[] = [];
  
  if (!config.jobs) return issues;
  
  for (const [jobName, jobDef] of Object.entries<any>(config.jobs)) {
    const steps = jobDef.steps || [];
    
    // Check for hardcoded values
    const stepsStr = JSON.stringify(steps);
    const hasHardcodedSecrets = /[a-z0-9]{20,}/i.test(stepsStr) && 
                                !stepsStr.includes('${') && 
                                !stepsStr.includes('$');
    
    if (hasHardcodedSecrets) {
      issues.push({
        id: `practice-hardcoded-${jobName}`,
        category: 'practice',
        priority: 'high',
        impactScore: 90,
        title: `${jobName}: ハードコードされた値の可能性`,
        currentState: '値が直接記述されています',
        problem: 'APIキーやトークンがハードコードされている可能性があり、セキュリティリスクです',
        recommendation: '環境変数を使用してください',
        codeExample: `- run:\n    name: Deploy\n    command: |\n      deploy --token $DEPLOY_TOKEN  # 環境変数を使用`,
        affectedJobs: [jobName],
      });
    }
  }
  
  return issues;
}

// ============================================================================
// Helper Functions
// ============================================================================

function safeAnalyze(analyzeFn: () => Issue[], category: string): Issue[] {
  try {
    return analyzeFn();
  } catch (error) {
    console.warn(`⚠️  Warning: ${category} analysis failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    console.warn('   Continuing with other checks...\n');
    return [];
  }
}

function detectExecutor(jobDef: any): 'docker' | 'machine' | 'macos' | 'unknown' {
  if (jobDef.docker) return 'docker';
  if (jobDef.machine) return 'machine';
  if (jobDef.macos) return 'macos';
  return 'unknown';
}

function estimateJobDuration(steps: any[]): number {
  // Simple heuristic based on step count
  if (steps.length < 3) return 2;
  if (steps.length < 5) return 4;
  if (steps.length < 8) return 7;
  return DEFAULT_JOB_DURATION_MINUTES;
}

function getImageFromJob(jobDef: any): string {
  if (jobDef.docker && jobDef.docker[0]) {
    return jobDef.docker[0].image || 'cimg/base:stable';
  }
  return 'cimg/base:stable';
}

function detectDependencyInstall(steps: any[]): boolean {
  const installPatterns = [
    /npm\s+install/,
    /yarn\s+install/,
    /bundle\s+install/,
    /pip\s+install/,
    /poetry\s+install/,
    /composer\s+install/,
    /gradle/,
    /mvn/,
  ];
  
  const stepsStr = JSON.stringify(steps);
  return installPatterns.some(pattern => pattern.test(stepsStr));
}

function detectLanguage(jobDef: any): string {
  const image = getImageFromJob(jobDef);
  
  if (image.includes('node') || image.includes('npm')) return 'Node.js';
  if (image.includes('ruby')) return 'Ruby';
  if (image.includes('python')) return 'Python';
  if (image.includes('java') || image.includes('openjdk')) return 'Java';
  if (image.includes('php')) return 'PHP';
  if (image.includes('golang') || image.includes('go')) return 'Go';
  
  return '汎用';
}

function generateCacheExample(language: string): string {
  const examples: Record<string, string> = {
    'Node.js': `- restore_cache:
    keys:
      - v1-deps-{{ checksum "package-lock.json" }}
      - v1-deps-
- run: npm install
- save_cache:
    key: v1-deps-{{ checksum "package-lock.json" }}
    paths:
      - node_modules`,
    'Ruby': `- restore_cache:
    keys:
      - v1-deps-{{ checksum "Gemfile.lock" }}
      - v1-deps-
- run: bundle install --path vendor/bundle
- save_cache:
    key: v1-deps-{{ checksum "Gemfile.lock" }}
    paths:
      - vendor/bundle`,
    'Python': `- restore_cache:
    keys:
      - v1-deps-{{ checksum "requirements.txt" }}
      - v1-deps-
- run: pip install -r requirements.txt
- save_cache:
    key: v1-deps-{{ checksum "requirements.txt" }}
    paths:
      - ~/.cache/pip`,
  };
  
  return examples[language] || `- restore_cache:
    keys:
      - v1-deps-{{ checksum "lockfile" }}
      - v1-deps-
- run: install dependencies
- save_cache:
    key: v1-deps-{{ checksum "lockfile" }}
    paths:
      - ./cache-path`;
}

function isTestJob(jobName: string, jobDef: any): boolean {
  const testPatterns = ['test', 'spec', 'jest', 'rspec', 'pytest', 'mocha'];
  const name = jobName.toLowerCase();
  
  if (testPatterns.some(pattern => name.includes(pattern))) {
    return true;
  }
  
  const steps = jobDef.steps || [];
  const stepsStr = JSON.stringify(steps).toLowerCase();
  return testPatterns.some(pattern => stepsStr.includes(pattern));
}

function findParallelOpportunities(jobs: any[]): string[] {
  const opportunities: string[] = [];
  
  // Simple heuristic: jobs without 'requires' field can be parallelized
  for (const job of jobs) {
    if (typeof job === 'object') {
      const jobName = Object.keys(job)[0];
      const jobDef = job[jobName];
      
      if (!jobDef.requires || jobDef.requires.length === 0) {
        opportunities.push(jobName);
      }
    }
  }
  
  return opportunities.length > 1 ? opportunities : [];
}

function calculateTotalSavings(issues: Issue[]): { costReduction: string; timeReduction: string } {
  // Simplified calculation - sum of all potential savings
  let totalCostSavings = 0;
  let totalTimeSavings = 0;
  
  issues.forEach(issue => {
    if (issue.estimatedSavings?.costReduction) {
      const match = issue.estimatedSavings.costReduction.match(/(\d+)%/);
      if (match) {
        totalCostSavings += parseInt(match[1]);
      }
    }
    if (issue.estimatedSavings?.timeReduction) {
      const match = issue.estimatedSavings.timeReduction.match(/(\d+)/);
      if (match) {
        totalTimeSavings += parseInt(match[1]);
      }
    }
  });
  
  const avgCostSavings = issues.length > 0 ? Math.round(totalCostSavings / issues.length) : 0;
  const avgTimeSavings = Math.min(totalTimeSavings, 30); // Cap at 30 minutes
  
  return {
    costReduction: `約${avgCostSavings}%`,
    timeReduction: `ビルドあたり ${avgTimeSavings}分`,
  };
}

// ============================================================================
// Report Generation
// ============================================================================

function displayReport(result: AnalysisResult, configPath: string): void {
  console.log('# CircleCI 設定最適化提案\n');
  console.log(`**分析対象**: ${configPath}`);
  console.log(`**検出された改善機会**: ${result.totalIssues}件 (高優先度: ${result.highPriority}件、中優先度: ${result.mediumPriority}件、低優先度: ${result.lowPriority}件)\n`);
  console.log('---\n');
  
  if (result.issues.length === 0) {
    console.log('✅ **素晴らしい!** 重大な問題は検出されませんでした。\n');
    console.log('設定はベストプラクティスに準拠しています。\n');
    return;
  }
  
  // Group by priority
  const highPriorityIssues = result.issues.filter(i => i.priority === 'high');
  const mediumPriorityIssues = result.issues.filter(i => i.priority === 'medium');
  const lowPriorityIssues = result.issues.filter(i => i.priority === 'low');
  
  // Display high priority issues
  if (highPriorityIssues.length > 0) {
    console.log('## 【優先度: 高】改善提案\n');
    highPriorityIssues.forEach((issue, index) => {
      displayIssue(issue, index + 1);
    });
  }
  
  // Display medium priority issues
  if (mediumPriorityIssues.length > 0) {
    console.log('## 【優先度: 中】改善提案\n');
    mediumPriorityIssues.forEach((issue, index) => {
      displayIssue(issue, index + 1);
    });
  }
  
  // Display low priority issues
  if (lowPriorityIssues.length > 0) {
    console.log('## 【優先度: 低】改善提案\n');
    lowPriorityIssues.forEach((issue, index) => {
      displayIssue(issue, index + 1);
    });
  }
  
  // Display summary
  console.log('---\n');
  console.log('## 総合評価\n');
  console.log(`**推定コスト削減**: ${result.estimatedMonthlySavings.costReduction}`);
  console.log(`**推定時間短縮**: ${result.estimatedMonthlySavings.timeReduction}\n`);
  console.log('**実装推奨順序**:');
  console.log('1. キャッシュ設定追加 (最も効果が大きく、リスクが低い)');
  console.log('2. resource_class 最適化 (即座にコスト削減)');
  console.log('3. 並列化の導入 (テストケースの調整が必要な場合がある)\n');
  console.log('**次のステップ**:');
  console.log('1. 上記の変更を段階的に実装');
  console.log('2. 各変更後にビルド時間とコストを測定');
  console.log('3. 必要に応じてさらなる調整\n');
}

function displayIssue(issue: Issue, index: number): void {
  console.log(`### ${index}. ${issue.title}\n`);
  console.log(`**問題**:`);
  console.log(`${issue.problem}\n`);
  console.log(`**現在の設定**:`);
  console.log(`${issue.currentState}\n`);
  console.log(`**推奨される変更**:`);
  console.log(`${issue.recommendation}\n`);
  
  if (issue.codeExample) {
    console.log(`**設定変更例**:`);
    console.log('```yaml');
    console.log(issue.codeExample);
    console.log('```\n');
  }
  
  if (issue.estimatedSavings) {
    if (issue.estimatedSavings.costReduction) {
      console.log(`**推定コスト削減**: ${issue.estimatedSavings.costReduction}`);
    }
    if (issue.estimatedSavings.timeReduction) {
      console.log(`**推定時間短縮**: ${issue.estimatedSavings.timeReduction}`);
    }
    console.log();
  }
  
  console.log('---\n');
}

// ============================================================================
// Entry Point
// ============================================================================

main();
