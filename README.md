# Comment file size on PR

Simple action to comment file size/s on a PR.

Just specify the path to a directory or file via `path`.

To diff against another directory or file set `diff_path`.

You can choose to upsert the existing bot comment or create new ones after every change by configuring the `update_comment` flag.

## Usage:

Please check the below code for detailed usage:

Listing the file sizes:
```yaml
name: CI

on:
  pull_request:
    types: ["opened", "reopened", "synchronize"]

permissions:
  contents: read
  pull-requests: write

jobs:
  calculate-size:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@master

      - uses: ./
        with:
          path: ${{ github.workspace }}
          token: ${{ secrets.GITHUB_TOKEN }}
```

Diffing the file sizes:
```yaml
name: CI

on:
  push:
  pull_request:

permissions:
  contents: read
  pull-requests: write

jobs:
  run:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@master
        with:
          ref: ${{ github.event.pull_request.head.sha }}
          path: head

      - uses: actions/checkout@master
        with:
          ref: ${{ github.event.pull_request.base.sha }}
          path: base

      - uses: ./head
        with:
          path: ${{ github.workspace }}/head
          diff_path: ${{ github.workspace }}/base
          token: ${{ secrets.GITHUB_TOKEN }}
```

## License

The scripts and documentation in this project are released under the [MIT License](./LICENSE)
test
