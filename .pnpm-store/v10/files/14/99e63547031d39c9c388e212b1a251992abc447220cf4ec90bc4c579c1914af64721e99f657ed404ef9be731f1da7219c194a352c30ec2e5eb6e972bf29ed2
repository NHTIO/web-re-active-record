# ESLint Formatter for GitLab

Show ESLint results directly in the
[GitLab code quality](https://docs.gitlab.com/ee/user/project/merge_requests/code_quality.html)
results.

## Table of Contents

- [Requirements](#requirements)
- [Installation](#installation)
- [Usage](#usage)
- [Example](#example)
- [Configuration](#configuration)
- [License](#license)

## Requirements

This package requires at least Node.js 18 and ESLint 5.

## Installation

Install `eslint` and `eslint-formatter-gitlab` using your package manager.

```sh
npm install --save-dev eslint eslint-formatter-gitlab
```

## Usage

Define a GitLab job to run `eslint`.

_.gitlab-ci.yml_:

```yaml
eslint:
  image: node:20-alpine
  script:
    - npm ci
    - npx eslint --format gitlab .
  artifacts:
    reports:
      codequality: gl-codequality.json
```

The formatter automatically detects a GitLab CI environment. It detects where to output the code
quality report based on the GitLab configuration file.

## Example

An example of the results can be seen in
[Merge Request !1](https://gitlab.com/remcohaszing/eslint-formatter-gitlab/merge_requests/1) of
`eslint-formatter-gitlab` itself.

## Configuration

ESLint formatters don’t take any configuration options. `eslint-formatter-gitlab` uses GitLab’s
[predefined environment variables](https://docs.gitlab.com/ee/ci/variables/predefined_variables.html)
to configure the output. In addition, the environment variable `ESLINT_CODE_QUALITY_REPORT` is used
to override the location to store the code quality report.

## License

[MIT](LICENSE.md) © [Remco Haszing](https://gitlab.com/remcohaszing)
