# Comment file size on PR

Simple action to comment file sizes on a PR. Just specify the path.

You can choose to upsert the existing bot comment or create new ones after every change.

## Usage:

Please check the below code for detailed usage:

```yaml
steps:
      - uses: actions/checkout@master
      - run: |
        npm install
        npm build
        # ... other build steps
      - uses: fatton139/JSBundleSize@master
        with:
          dist_path: "./path-to-output-dir-or-file"
          update_comment: false
          token: ${{ secrets.GITHUB_TOKEN }}

```

## License

The scripts and documentation in this project are released under the [MIT License](./LICENSE)
