const { createHash } = require('node:crypto')
const { existsSync, lstatSync, mkdirSync, readFileSync, writeFileSync } = require('node:fs')
const { EOL } = require('node:os')
const { dirname, join, relative, resolve } = require('node:path')

const chalk = require('chalk')
const yaml = require('yaml')

const {
  CI_COMMIT_SHORT_SHA,
  CI_CONFIG_PATH = '.gitlab-ci.yml',
  CI_JOB_NAME,
  CI_PROJECT_DIR = process.cwd(),
  CI_PROJECT_URL,
  ESLINT_CODE_QUALITY_REPORT,
  GITLAB_CI
} = process.env

/** @type {yaml.CollectionTag} */
const reference = {
  tag: '!reference',
  collection: 'seq',
  default: false,
  resolve() {
    // We only allow the syntax. We don’t actually resolve the reference.
  }
}

/**
 * @returns {string}
 *   The output path of the code quality artifact.
 */
function getOutputPath() {
  const configPath = join(CI_PROJECT_DIR, CI_CONFIG_PATH)
  // GitlabCI allows a custom configuration path which can be a URL or a path relative to another
  // project. In these cases CI_CONFIG_PATH is empty and we'll have to require the user provide
  // ESLINT_CODE_QUALITY_REPORT.
  if (!existsSync(configPath) || !lstatSync(configPath).isFile()) {
    throw new Error(
      'Could not resolve .gitlab-ci.yml to automatically detect report artifact path.' +
        ' Please manually provide a path via the ESLINT_CODE_QUALITY_REPORT variable.'
    )
  }
  const doc = yaml.parseDocument(readFileSync(configPath, 'utf8'), {
    version: '1.1',
    customTags: [reference]
  })
  const path = [CI_JOB_NAME, 'artifacts', 'reports', 'codequality']
  const location = doc.getIn(path)
  if (typeof location !== 'string' || !location) {
    throw new TypeError(
      `Expected ${path.join('.')} to be one exact path, got: ${JSON.stringify(location)}`
    )
  }
  return resolve(CI_PROJECT_DIR, location)
}

/**
 * @param {string} filePath
 *   The path to the linted file.
 * @param {import('eslint').Linter.LintMessage} message
 *   The ESLint report message.
 * @param {Set<string>} hashes
 *   Hashes already encountered. Used to avoid duplicate hashes
 * @returns {string}
 *   The fingerprint for the ESLint report message.
 */
function createFingerprint(filePath, message, hashes) {
  const md5 = createHash('md5')
  md5.update(filePath)
  if (message.ruleId) {
    md5.update(message.ruleId)
  }
  md5.update(message.message)

  // Create copy of hash since md5.digest() will finalize it, not allowing us to .update() again
  let md5Tmp = md5.copy()
  let hash = md5Tmp.digest('hex')

  while (hashes.has(hash)) {
    // Hash collision. This happens if we encounter the same ESLint message in one file
    // multiple times. Keep generating new hashes until we get a unique one.
    md5.update(hash)

    md5Tmp = md5.copy()
    hash = md5Tmp.digest('hex')
  }

  hashes.add(hash)
  return hash
}

/**
 * @param {import('eslint').ESLint.LintResult[]} results
 *   The ESLint report results.
 * @param {import('eslint').ESLint.LintResultData} data
 *   The ESLint report result data.
 * @returns {import('codeclimate-types').Issue[]}
 *   The ESLint messages in the form of a GitLab code quality report.
 */
function convert(results, data) {
  /** @type {import('codeclimate-types').Issue[]} */
  const messages = []

  /** @type {Set<string>} */
  const hashes = new Set()

  for (const result of results) {
    const relativePath = relative(CI_PROJECT_DIR, result.filePath)

    for (const message of result.messages) {
      /** @type {import('codeclimate-types').Issue} */
      const issue = {
        type: 'issue',
        categories: ['Style'],
        check_name: message.ruleId ?? '',
        description: message.message,
        severity: message.fatal ? 'critical' : message.severity === 2 ? 'major' : 'minor',
        fingerprint: createFingerprint(relativePath, message, hashes),
        location: {
          path: relativePath,
          lines: {
            begin: message.line,
            end: message.endLine ?? message.line
          }
        }
      }
      messages.push(issue)

      if (!message.ruleId) {
        continue
      }

      if (!data.rulesMeta[message.ruleId]) {
        continue
      }

      const { docs, type } = data.rulesMeta[message.ruleId]
      if (type === 'problem') {
        issue.categories.unshift('Bug Risk')
      }

      if (!docs) {
        continue
      }

      let body = docs.description || ''
      if (docs.url) {
        if (body) {
          body += '\n\n'
        }
        body += `[${message.ruleId}](${docs.url})`
      }

      if (body) {
        issue.content = { body }
      }
    }
  }
  return messages
}

/**
 * Make a text singular or plural based on the count.
 *
 * @param {number} count
 *   The count of the data.
 * @param {string} text
 *   The text to make singular or plural.
 * @returns {string}
 *   The formatted text.
 */
function plural(count, text) {
  return `${count} ${text}${count === 1 ? '' : 's'}`
}

/**
 * @param {import('eslint').ESLint.LintResult[]} results
 *   The ESLint report results.
 * @returns {string}
 *   The ESLint messages converted to a format suitable as output in GitLab CI job logs.
 */
function gitlabConsoleFormatter(results) {
  // Severity labels manually padded to have equal lengths and end with spaces
  const labelFatal = `${chalk.magenta('fatal')}  `
  const labelError = `${chalk.red('error')}  `
  const labelWarn = `${chalk.yellow('warn')}   `

  const lines = ['']

  /** @type {string | undefined} */
  let gitLabBaseURL
  if (CI_PROJECT_URL && CI_COMMIT_SHORT_SHA) {
    gitLabBaseURL = `${CI_PROJECT_URL}/-/blob/${CI_COMMIT_SHORT_SHA}/`
  }

  let fatal = 0
  let errors = 0
  let warnings = 0
  let maxRuleIdLength = 0
  let maxMsgLength = 0

  for (const result of results) {
    fatal += result.fatalErrorCount
    errors += result.errorCount - result.fatalErrorCount
    warnings += result.warningCount
    for (const message of result.messages) {
      if (message.ruleId) {
        maxRuleIdLength = Math.max(maxRuleIdLength, message.ruleId.length)
      }
      maxMsgLength = Math.max(maxMsgLength, message.message.length)
    }
  }

  for (const result of results) {
    const { filePath, messages } = result
    const repoFilePath = relative(CI_PROJECT_DIR, filePath)

    for (const message of messages) {
      let line = message.fatal ? labelFatal : message.severity === 1 ? labelWarn : labelError
      line += String(message.ruleId || '').padEnd(maxRuleIdLength + 2)
      line += message.message.padEnd(maxMsgLength + 2)

      if (gitLabBaseURL) {
        // Create link to referenced file in GitLab
        let anchor = `#L${message.line}`
        if (message.endLine != null && message.endLine !== message.line) {
          anchor += `-${message.endLine}`
        }
        line += chalk.blue(`${gitLabBaseURL}${repoFilePath}${anchor}`)
      } else {
        line += `${filePath}:${message.line}:${message.column}`
      }

      lines.push(line)
    }
  }

  const total = warnings + errors + fatal
  if (total > 0) {
    const details = `(${fatal} fatal, ${plural(errors, 'error')}, ${plural(warnings, 'warning')})`
    lines.push('', `${chalk.red('✖')} ${plural(total, 'problem')} ${details}`)
  } else {
    lines.push(`${chalk.green('✔')} No problems found`)
  }

  lines.push('')
  return lines.join(EOL)
}

/**
 * @param {import('eslint').ESLint.LintResult[]} results
 *   The ESLint report results.
 * @param {import('eslint').ESLint.LintResultData} data
 *   The ESLint report result data.
 * @returns {string}
 *   The ESLint output to print to the console.
 */
function eslintFormatterGitLab(results, data) {
  /* c8 ignore start */
  if (GITLAB_CI === 'true') {
    chalk.level = 1
  }

  /* c8 ignore stop */
  if (CI_JOB_NAME || ESLINT_CODE_QUALITY_REPORT) {
    const issues = convert(results, data)
    const outputPath = ESLINT_CODE_QUALITY_REPORT || getOutputPath()
    const dir = dirname(outputPath)
    mkdirSync(dir, { recursive: true })
    writeFileSync(outputPath, JSON.stringify(issues, null, 2))
  }

  return gitlabConsoleFormatter(results)
}

module.exports = eslintFormatterGitLab
