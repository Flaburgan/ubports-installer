#!/usr/bin/env node

"use strict"

/*

This file is a part of ubports-installer

Author: Marius Gripsgard <mariogrip@ubports.com>

*/

const builder = require("electron-builder")
const cli = require("commander");
const utils = require("./src/utils");
const unzip = require("unzip");
const path = require("path");
const fs = require("fs-extra");
const events = require("events");
class event extends events {}
const Platform = builder.Platform
const platformToolsPath = "./platform-tools"
const platformToolsUrls = {
  "linux": "https://dl.google.com/android/repository/platform-tools-latest-linux.zip",
  "mac": "https://dl.google.com/android/repository/platform-tools-latest-darwin.zip",
  "win": "https://dl.google.com/android/repository/platform-tools-latest-windows.zip"
}

const setEvents = (downloadEvent) => {
  downloadEvent.on("download:error", (r) => {
    console.log("Download error " + r);
  });
  downloadEvent.on("error", (r) => {
    console.log("Error: " + r);
  });
  downloadEvent.on("download:start", (r) => {
    console.log("Starting download of " + r + " files");
  });
  downloadEvent.on("download:next", (i) => {
    console.log(`Downloading next file, ${i} left`);
  });
  downloadEvent.on("download:progress", (i) => {
    process.stdout.write(`Downloading file, ${Math.ceil(i.percent*100)}% complete\r`);
  });
}

function canBuildSnap() {
  return fs.existsSync("/usr/bin/snapcraft") || fs.existsSync("/snap/bin/snapcraft")
}

function getLinuxTargets() {
  if (cli.appimageOnly) {
    return ["AppImage"];
  } else if (cli.snapOnly) {
    if (canBuildSnap()) {
      return ["snap"];
    } else {
      console.log("Snapcraft is not installed. Aborting build...")
      process.exit(1);
    }
  } else if (cli.buildToDir) {
    return ["dir"];
  } else if (cli.debOnly) {
    return ["deb"];
  }

  var linuxTargets = [];
  if (!cli.ignoreSnap && canBuildSnap()) {
    linuxTargets.push("snap")
  } else {
    console.log("Cannot build snap, please install snapcraft (ignoring building of snap for now)")
  }
  if (!cli.ignoreDeb) {
    linuxTargets.push("deb")
  }
  if (!cli.ignoreAppimage) {
    linuxTargets.push("AppImage")
  }

  if (linuxTargets.length !== 0) {
    return linuxTargets;
  } else {
    console.log("linux targets cannot be null")
    process.exit(1)
  }
}

function build() {
  builder.build({
      targets: builder.createTargets(targets),
      config: buildConfig
    }
  )
  .then(() => {
      console.log("Done");
    }
  )
  .catch((e) => {
    console.log(e);
    process.exit(1);
  })
}

function getAndroidPlatformTools() {
  var targets = [];
  if (cli.linux) targets.push("linux");
  if (cli.windows) targets.push("win");
  if (cli.mac) targets.push("mac");
  if (targets.length === 0) targets = ["linux", "win", "mac"];
  var downloadArray = [];
  targets.forEach((target) => {
    downloadArray.push({
      url: platformToolsUrls[target],
      path: platformToolsPath,
      target: target
    })
  });
  return downloadArray;
};

function downloadPlatformTools() {
  const downloadEvent = new event();
  setEvents(downloadEvent);
  utils.downloadFiles(getAndroidPlatformTools(), downloadEvent);
  downloadEvent.on("download:done", () => {
    extractPlatformTools(getAndroidPlatformTools(), () => {
      console.log("Platform tools downloaded successfully!");
      if(!cli.downloadOnly) build();
    });
  });
};

function extractPlatformTools(platformToolsArray, callback) {
  var i = platformToolsArray[0];
  fs.createReadStream(path.join(i.path, path.basename(i.url))).pipe(unzip.Extract({
    path: path.join(i.path, i.target + "_tmp")
  })).on("close", () => {
    fs.move(path.join(i.path, i.target + "_tmp", "platform-tools"), path.join(i.path, i.target), {
      overwrite: true
    }, (e) => {
      fs.removeSync(path.join(i.path, i.target + "_tmp"))
      if (i.target !== "win") {
        fs.chmodSync(path.join(i.path, i.target, "fastboot"), 0o755);
        fs.chmodSync(path.join(i.path, i.target, "adb"), 0o755);
      }
      if (platformToolsArray.length <= 1) {
        callback()
      } else {
        platformToolsArray.shift();
        extractPlatformTools(platformToolsArray, callback);
      }
    });
  });
}

cli
  .version(1)
  .option('-l, --linux', 'Build for Linux')
  .option('-w, --windows', 'Build for Windows')
  .option('-m, --mac', 'Build for Mac')
  .option('-d, --download-only', 'Only download platformTools')
  .option('-s, --snap-only', "Build only snap")
  .option('-e, --deb-only', "Build only snap")
  .option('-a, --appimage-only', "Build only appimage")
  .option('-r, --ignore-snap', "Build only snap")
  .option('-t, --ignore-deb', "Build only snap")
  .option('-y, --ignore-appimage', "Build only appimage")
  .option('-b, --build-to-dir', "Build only to dir")
  .option('-n, --no-platform-tools', "Build without platform tools")
  .parse(process.argv);

var targets = [];
var buildConfig = require("./buildconfig-generic.json");

if (cli.linux) {
  targets.push(Platform.LINUX);
  buildConfig = Object.assign(buildConfig, {
      "linux": {
        "target": getLinuxTargets(),
        "icon": "build/icons",
        "synopsis": "Install Ubuntu Touch on UBports devices",
        "category": "Utility"
      },
      "deb": {
        "depends": ["gconf2", "gconf-service", "libnotify4", "libappindicator1", "libxtst6", "libnss3", "android-tools-adb", "android-tools-fastboot"]
      }
    }
  );
}
if (cli.windows) {
  targets.push(Platform.WINDOWS);
  buildConfig = Object.assign(buildConfig, {
      "win": {
        "target": ["portable"],
        "icon": "build/icons/icon.ico"
      }
    }
  );
}
if (cli.mac) {
  targets.push(Platform.MAC);
  buildConfig = Object.assign(buildConfig, {
      "mac": {
        "target": "dmg",
        "icon": "build/icons/icon.icns",
        "category": "public.app-category.utilities"
      }
    }
  );
}

if (targets.length === 0) targets = [Platform.MAC, Platform.WINDOWS, Platform.LINUX];

if (cli.platformTools) downloadPlatformTools();
else build();
