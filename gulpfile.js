'use strict';

// node modules
const fs = require('fs');
const path = require('path');
const gulp = require('gulp');
const browserSync = require('browser-sync');
const vfb = require('vinyl-ftp-branch');
const ftp = require('vinyl-ftp');
const del = require('del');
const eventStream = require('event-stream');
const runSequence = require('run-sequence');
const through = require('through2');
const cheerio = require('cheerio');
const glob = require('glob');

// gulp modules
const sass = require('gulp-sass');
const postcss = require('gulp-postcss');
const sourcemaps = require('gulp-sourcemaps');
const handlebars = require('gulp-compile-handlebars');
const rename = require('gulp-rename');
const spritesmith = require('gulp.spritesmith');
const md5 = require('gulp-md5-plus');
const gulpif = require('gulp-if');
const plumber = require('gulp-plumber');
const cleanCSS = require('gulp-clean-css');
const uitIndex = require('gulp-nts-uit-index-helper');
const gulpSort = require('gulp-sort');
const data = require('gulp-data');

// notification
const notify = require("gulp-notify");

// postcss
const autoprefixer = require('autoprefixer');
const urlRebase = require('postcss-url');
const cssvariables = require('postcss-css-variables');
const csssort = require('gulp-nts-css-formatter');

// svg
var svgSprite = require('gulp-svg-sprite');
var svg2png = require('gulp-svg2png');
var svgmin = require('gulp-svgmin');

var paths = {
  html_path: 'src',
  sprite_src: 'src/sprite/',
  sprite_dest: 'src/img/sprite/',
  sprite_svg: 'src/sprite_svg/',
  css_src: 'src/scss/',
  css_dest: 'src/css/',
  img_dest: 'src/img/',
  img_static: 'https://imgsports.pstatic.net/images/'
};

var config = {
  browserSync: true,
  notify: true,
  urlRebase: true,
  urlRebaseOption: {
    basePath: paths.img_dest,
    defaultUrl: '../img/',
    urlList: {
      'sprite/': {
        //상대경로 작업 필요시 주석처리 하면 됩니다.
      }
    },
  },
  md5: false,
  uitIndex: true,
  uitIndexOption: {
    path: path.join(paths.html_path,'/**/*.html'),
    options: {
      title: 'M : 스포츠 마크업',
      fileSort: 'title'
    }
  },
  sprite_ratio: {
    png: 2,
    svg: 2,
  },
  autoprefixer: {
    browsers: ["Android > 0","iOS > 0","FirefoxAndroid > 0",'last 2 versions', "Edge > 0", "ie >= 8"] //모바일옵션
    // ['last 2 versions', "Edge > 0", "ie >= 8"] //PC옵션
  }
}

function getFolders(dir) {
  var result;

  try {
    result = fs.readdirSync(dir).filter(function (file) {
      return fs.statSync(path.join(dir, file)).isDirectory();
    });
  } catch (err) {
    if (err.code === 'ENOENT') {
      // console.log('\x1b[31m',dir + "이란 폴더가 없습니다.");
    } else {
      throw err;
    }
  }

  return result;
};

function getCssIndex(src) {
  return through.obj(function (chunk, enc, callback) {

    try {
      fs.lstatSync(src);
    } catch (err) {
      throw err;
    }

    var files = glob.sync(src + '/**/*.css');
    var cssList = [];

    files.forEach(function (css) {
      if (!/map/.test(css)){
        css = css.replace('src/', '');
        var item = {
          path: css,
          dir: path.dirname(css),
          basename: path.basename(css),
          title: path.basename(css)
        };
        cssList.push(item);
      }
    });

    cssList.sort(function (a, b) {
      if (a.title > b.title) {
        return 1;
      }
      if (a.title < b.title) {
        return -1;
      }
      return 0;
    });

    var cssGroup = {
      groupName: 'CSS',
      groupList: cssList
    };

    var htmlString = chunk.contents.toString('utf-8');
    var $ = cheerio.load(htmlString, {decodeEntities: false});
    var filelist_json = $('script')[0].children[0].data;
    var data_string = filelist_json.trim().split('= ')[1].slice(0, -1);
    var data_json = JSON.parse(data_string);

    data_json.push(cssGroup);
    data_string = `\n\t\tvar filelist_json = ${JSON.stringify(data_json)};\n\t`;
    $('script')[0].children[0].data = data_string;

    chunk.contents = new Buffer($.html());

    this.push(chunk);
    callback();
  });
};

var globalOptions = {
  notify: !config.notify ? {} : {
    errorHandler: notify.onError({
      title: '<%= error.relativePath %>',
      message: '<%= error.line %> line - <%= error.messageOriginal %>',
      sound: "Pop",
    })
  }
}

gulp.task('default', ['watch', 'browserSync']);
gulp.task('dev', function(cb) {
  runSequence(['sprite','sprite-svg'], 'sass', cb);
});
gulp.task('build', ['sass-build','sprite','md5-sprite','md5-sprite-svg','uit_index']);
gulp.task('watch', ['dev'], function () {
  var options = {};
  gulp.watch([path.join(paths.css_src, '/**/*')], ['sass']);
  gulp.watch([path.join(paths.sprite_src, '/**/*')], ['sprite']);
  gulp.watch([path.join(paths.sprite_svg, '/**/*')], ['sprite-svg']);
});

gulp.task('sprite',['makeSpriteMap']);

gulp.task('makeSprite', function () {
  var stream_arr = [];
  var folders = getFolders(paths.sprite_src);
  var options = {
    spritesmith: function(folder) {
      return {
        imgPath: path.posix.relative(paths.css_dest, path.posix.join(paths.sprite_dest, 'sp_' + folder + '.png')),
        imgName: 'sp_' + folder + '.png',
        cssName: '_sp_' + folder + '.scss',
        cssFormat: 'scss',
        padding: 4,
        cssTemplate: './gulpconf/sprite_template.hbs',
        cssSpritesheetName: 'sp_' + folder,
        cssHandlebarsHelpers: {
          sprite_ratio: config.sprite_ratio.png
        }
      }
    },
  };



  if (folders) {
    folders.map(function(folder) {
      var spriteData = gulp.src(path.join(paths.sprite_src, folder, '*.png'))
        .pipe(plumber(globalOptions.notify))
        .pipe(gulpSort())
        .pipe(spritesmith(options.spritesmith(folder)));
      stream_arr.push(new Promise(function(resolve) {
        spriteData.img
          .pipe(gulp.dest(paths.sprite_dest))
          .on('end',resolve);
      }));
      stream_arr.push(new Promise(function(resolve) {
        spriteData.css
          .pipe(gulp.dest(path.join(paths.css_src, 'sprite')))
          .on('end', resolve);
      }));
    });
  }

  return Promise.all(stream_arr);
});

gulp.task('makeSpriteMap', ['makeSprite'], function() {
  var folders = getFolders(paths.sprite_src);
  if (!folders) return;

  var options = {
    maps: {
      handlebars: {
        prefix: 'sp_',
        path: path.posix.relative(path.posix.join(paths.css_src, 'import'),path.posix.join(paths.css_src, 'sprite')),
        import: folders,
      }
    },
  };

  return gulp.src('gulpconf/sprite_maps_template.hbs')
    .pipe(plumber(globalOptions.notify))
    .pipe(handlebars(options.maps.handlebars))
    .pipe(rename('_sprite_maps.scss'))
    .pipe(gulp.dest(path.join(paths.css_src, 'import')));
});

gulp.task('sprite-svg', ['makeSpriteMap-svg'], function () {
  var sprite_list = getFolders(paths.sprite_svg);
  if (!sprite_list) return;

  for(var i=0;i < sprite_list.length;i++) {
      sprite_list[i] = path.join(paths.sprite_dest,'sp_' + sprite_list[i] + '.svg');
  }

  return gulp.src(sprite_list)
    .pipe(svgmin())
    .pipe(svg2png())
    .pipe(data((file, cb) => {
      var offset = Buffer([137, 80, 78, 71, 13, 10, 26, 10]).length;

  while (1) {
    var rawLength = file.contents.slice(offset, offset+=4);
    var length = rawLength.readUInt32BE(0);
    var rawType = file.contents.slice(offset, offset+=4);
    var type = rawType.toString();
    var width = 0;
    var height = 0;

    if (type === 'pHYs') {
      var rawData = file.contents.slice(offset, offset+9);
      var x = rawData.slice(0, 4).readUInt32BE(0);
      var y = rawData.slice(4, 8).readUInt32BE(0);
      var unitSpecifier = rawData.slice(8, 9).readUInt8(0);
      var rawCrc = file.contents.slice(offset+9, offset+13);

      if (x !== 2835 || y !== 2835) {
        file.contents.writeUInt32BE(2835, offset);
        file.contents.writeUInt32BE(2835, offset+4);
        file.contents.writeUInt8(1, offset+8);
        file.contents.writeUInt32BE(0x009a9c18, offset+9);
      }
      break;
    } else if (type === 'IEND') {
      break;
    } else {
      offset += length+4;
    }
  }

  cb(null, file);
}))
  .pipe(gulp.dest(paths.sprite_dest));
});

gulp.task('makeSprite-svg', function(){
  var streamArr = [];
  var folders = getFolders(paths.sprite_svg);

  if (!folders) return;

  for(var i = 0,imax = folders.length;i<imax;i++) {
    var folder = folders[i];
    var gulpStream = gulp.src(path.join(paths.sprite_svg,folder,'*.svg'))
      .pipe(gulpSort())
      .pipe(svgSprite({
        shape: {
          spacing: {
            padding: 4
          }
        },
        mode: {
          css: {
            dest: './',
            bust: false,
            sprite: 'sp_' + folder + '.svg',
            render: {
              scss: {
                template: 'gulpconf/sprite_svg_template.hbs',
                dest: path.posix.relative(paths.sprite_dest, path.posix.join(paths.css_src, 'sprite', '_sp_'+folder+'.scss')),
              }
            }
          }
        },
        variables: {
          spriteSheetName: folder,
          baseName: path.posix.relative(paths.css_src, paths.sprite_dest) + '/sp_' + folder,
          sprite_ratio: config.sprite_ratio.svg,
        }
      }))
      .pipe(gulp.dest(paths.sprite_dest));

    streamArr.push(gulpStream);
  }

  return eventStream.merge(streamArr);
});

// Sprite Map List
gulp.task('makeSpriteMap-svg', ['makeSprite-svg'], function(){
  var folders = getFolders(paths.sprite_svg);
  if (!folders) return;

  var options = {
    maps: {
      handlebars: {
        prefix: 'sp_',
        exe: 'scss',
        path: path.posix.relative(path.posix.join(paths.css_src, 'import'),path.posix.join(paths.css_src, 'sprite')),
        import: folders
      }
    },
  };

  return gulp.src('gulpconf/sprite_svg_maps_template.hbs')
    .pipe(plumber(globalOptions.notify))
    .pipe(handlebars(options.maps.handlebars))
    .pipe(rename('_sprite_svg_maps.scss'))
    .pipe(gulp.dest(path.join(paths.css_src, 'import')));
});

gulp.task('sass', function() {
  let gulpPipe = gulp.src(path.join(paths.css_src, '**/*.scss'))
    .pipe(plumber(globalOptions.notify))
    .pipe(sourcemaps.init());

  gulpPipe = sassPipe(gulpPipe);

  return gulpPipe
    .pipe(sourcemaps.write('./'))
    .pipe(gulp.dest(paths.css_dest))
    .pipe(gulpif(config.browserSync, browserSync.stream({match:'**/*.css'})));
});

gulp.task('sass-build', ['sprite','md5-sprite'], function() {
  return Promise.all([
    del(path.join(paths.css_dest,'**/*.css.map')),
    new Promise(function(resolve) {
      let gulpPipe = gulp.src(path.join(paths.css_src, '**/*.scss'))
        .pipe(plumber(globalOptions.notify));

      gulpPipe = sassPipe(gulpPipe, true);

      gulpPipe
        .pipe(gulp.dest(paths.css_dest))
        .on('end',resolve);
    })
  ]);
});

gulp.task('minify', [], function() {
  var options = {
    cleanCSS: {
      'advanced' : false,           // 속성 병합 false
      'aggressiveMerging': false,   // 속성 병합 false
      'restructuring': false,       // 선택자의 순서 변경 false
      'mediaMerging': false,        // media query 병합 false
      'compatibility': 'ie7,ie8,*', // IE 핵 남김
    }
  };
  return gulp.src(path.join(paths.css_dest, '*.css'))
    .pipe(cleanCSS(options.cleanCSS))
    .pipe(gulp.dest(paths.css_dest));
});

gulp.task('browserSync', function() {
  var options = {
    browserSync: {
      server: {
        baseDir: paths.html_path,
        directory: true
      },
      open: 'external',
    },
  };

  if(config.browserSync) {
    browserSync.init(options.browserSync);
    gulp.watch(paths.html_path+'/*.html').on('change',browserSync.reload);
  }
});

// gulp.task('ftp', function() {
//   var options = {
//     ftp: {
//       host: 'imgup.sports.naver.com',
//       port: '21',
//       userKeyFile: '.ftppass', //[TODO].ftppass 처리 방법
//       userKey: 'key1',
//       parallel: 10, //병렬 전송 갯수 (기본값 3, 10이상 효과 미비)
//       remotePath: '/2019/m/', //[TODO]각 서비스 업로드 경로 설정 필요
//       log: true,
//     },
//     targetGlob: [path.join(paths.css_dest,'**/*'), '!node_modules/'], // glob 문법으로 대상 지정
//   };
//
//   try {
//     var chkFtppass = fs.accessSync('.ftppass', 'r'); // .ftppass 파일 존재 여부 확인
//   } catch(e) {
//     console.log('Not Exist .ftppass file. Please make .ftppass'); // .ftppass 파일이 없을 경우 에러
//     return;
//   }
//   if(!options.ftp.remotePath || options.ftp.remotePath === '/') {  // remotePath 설정이 비어 있거나 '/'인지 확인.
//     console.log('remotePath not set or set root');
//     return;
//   }
//
//   var conn = ftp.create(vfb(options.ftp));
//
//   return gulp.src(options.targetGlob, {buffer: false})
//     .pipe(plumber(globalOptions.notify))
//     .pipe(conn.newer(conn.config.finalRemotePath))
//     .pipe(conn.dest(conn.config.finalRemotePath));
// });

gulp.task('uit_index',function(){
  if(config.uitIndex) {
    return gulp.src(config.uitIndexOption.path) // 인덱스 대상 파일 선택
      .pipe(uitIndex(config.uitIndexOption.options))
      .pipe(getCssIndex(paths.css_dest)) // css 인덱스 추가 생성
      .pipe(gulp.dest('src/')); // 인덱스 저장 경로
  }
});

gulp.task('md5-sprite', ['makeSprite'], function() {
  var options = {
    md5: {
      cssSrc: path.join(paths.css_src,'sprite/*.scss'), //이름 변경 대상 css(scss) 파일
      srcDel: false, // sprite 이름 변경전 파일 삭제 여부
      logDel: true, // 이전 생성된 md5 sprite 삭제 여부
    }
  }

  if(config.md5) {
    var del_sprite = [];
    var sprite_list = getFolders(paths.sprite_src);
    if (!sprite_list) return;

    for(var i=0,imax=sprite_list.length;i < imax;i++) {
      del_sprite.push(path.join(paths.sprite_dest,'sp_' + sprite_list[i] + '_????????.png'));
      sprite_list[i] = path.join(paths.sprite_dest,'sp_' + sprite_list[i] + '.png');
    }

    return del(del_sprite)
      .then(function() {
        return new Promise(function(resolve) {
          gulp.src(sprite_list)
            .pipe(plumber(globalOptions.notify))
            .pipe(md5(8,options.md5.cssSrc))
            .pipe(gulp.dest(paths.sprite_dest))
            .on('end',resolve);
        });
      }).then(function() {
        if(options.md5.srcDel) {
          return del(sprite_list);
        }
      });
  }
});

gulp.task('md5-sprite-svg', ['makeSprite-svg'], function() {
  var options = {
    md5: {
      cssSrc: path.join(paths.css_src,'sprite/*.scss'), //이름 변경 대상 css(scss) 파일
      srcDel: false, // sprite 이름 변경전 파일 삭제 여부
      logDel: true, // 이전 생성된 md5 sprite 삭제 여부
    }
  }

  if(config.md5) {
    var del_sprite = [];
    var sprite_list = getFolders(paths.sprite_svg);
    var target_list = [];

    if (!sprite_list) return;

    for(var i=0,imax=sprite_list.length;i < imax;i++) {
      del_sprite.push(path.join(paths.sprite_dest,'sp_' + sprite_list[i] + '_????????.png'));
      del_sprite.push(path.join(paths.sprite_dest,'sp_' + sprite_list[i] + '_????????.svg'));
      target_list.push(path.join(paths.sprite_dest,'sp_' + sprite_list[i] + '.png'));
      target_list.push(path.join(paths.sprite_dest,'sp_' + sprite_list[i] + '.svg'));
    }
    return del(del_sprite)
      .then(function() {
        return new Promise(function(resolve) {
          gulp.src(target_list)
            .pipe(plumber(globalOptions.notify))
            .pipe(md5(8,options.md5.cssSrc))
            .pipe(gulp.dest(paths.sprite_dest))
            .on('end',resolve);
        });
      }).then(function() {
        if(options.md5.srcDel) {
          return del(target_list);
        }
      });
  }
});

function sassPipe(gulpPipe, build) {
  var options = {
    sass : {
      outputStyle: 'compact',
      indentType: 'tab',
      indentWidth: 1
    },
    autoprefixer: {
      browsers: config.autoprefixer.browsers
    }
  };

  options.postcss = [
    autoprefixer(options.autoprefixer),
    cssvariables()
  ];

  if(build && config.urlRebase) {
    options.postcss.push(urlRebase({
      basePath: path.relative(paths.css_dest,config.urlRebaseOption.basePath),
      url: function (asset) {
        var rebasedUrl = asset.url;
        var basePath = path.posix.relative(paths.css_dest,config.urlRebaseOption.basePath);
        if(asset.url.indexOf(basePath) == 0) {
          rebasedUrl = config.urlRebaseOption.defaultUrl + path.posix.relative(basePath, asset.url);
        }
        for (var name in config.urlRebaseOption.urlList) {
          if (config.urlRebaseOption.urlList.hasOwnProperty(name)) {
            var value = config.urlRebaseOption.urlList[name];
            var basePath = path.posix.join(basePath, name);
            if(asset.url.indexOf(basePath) == 0) {
              if (value.constructor === Object) {
                for (var spname in value) {
                  if (path.posix.relative(basePath, asset.url).indexOf(spname) > -1) {
                    rebasedUrl = value[spname] + path.posix.relative(basePath, asset.url);
                  }
                }
              } else {
                rebasedUrl = config.urlRebaseOption.urlList[name] + path.posix.relative(basePath, asset.url);
              }
            }
          }
        }
        return rebasedUrl;
      },
    }));
  }

  gulpPipe = gulpPipe.pipe(sass(options.sass)).pipe(postcss(options.postcss));
  if (build) {
    gulpPipe = gulpPipe.pipe(postcss(options.postcss)).pipe(csssort());
  }

  return gulpPipe;
}
