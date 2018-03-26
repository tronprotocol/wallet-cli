const path = require("path");
const packageJson = require('./package.json');
const {getIfUtils, removeEmpty} = require('webpack-config-utils');
const {ifProduction} = getIfUtils(process.env.NODE_ENV);

module.exports = {
  mode: process.env.NODE_ENV,
  entry: {
    app: path.resolve(__dirname, 'src/web/app.js'),
  },
  output: {
    path: path.resolve(__dirname, 'src/main/resources/static/dist'),
    filename: "[name].js",
    publicPath: '/',
  },
  resolve: {
    extensions: ['.js'],
  },
  module: {
    rules: [
      {
        test: /\.js$/,
        include: [
          path.resolve(__dirname, "src/web"),
        ],
        loader: 'babel-loader',
        options: {
          presets: ['latest'],
          plugins: [
            "transform-class-properties",
            "transform-object-rest-spread",
          ]
        }
      },
      {
        test: /\.html/,
        use: 'html-loader'
      },
      {
        test: /\.scss$/,
        use: ["style-loader", "css-loader", "sass-loader"]
      },
      {
        test: /\.css$/,
        use: ["style-loader", "css-loader"]
      },
      {
        test: /\.png$/,
        use: "url-loader?limit=100000"
      },
      {
        test: /\.jpg$/,
        use: "file-loader"
      },
      {
        test: /\.woff(2)?(\?v=[0-9]\.[0-9]\.[0-9])?$/,
        use: "url-loader?limit=10000&minetype=application/font-woff"
      },
      {
        test: /\.(gif|svg|ttf|eot|svg)(\?v=[0-9]\.[0-9]\.[0-9])?$/,
        use: "file-loader"
      }
    ]
  },
  devServer: {
    contentBase: path.resolve(__dirname, "/assets/build"),
    compress: true,
    headers: {
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY'
    },
    open: true,
    overlay: {
      warnings: true,
      errors: true
    },
    port: 8181,
    publicPath: '/assets/build/',
    hot: true,
    inline: true,
  },
};
