const fs = require("fs");
const path = require("path");
const { app, ipcRenderer, shell } = require("electron");

const json = require("../modules/json");

const lang = require("../lang");
var modsobj = {
	all: [],
	enabled: [],
	disabled: []
}

let shouldInstallNorthstar = false;

// Base settings
var settings = {
	nsargs: "",
	gamepath: "",
	nsupdate: true,
	autolang: true,
	forcedlang: "en",
	autoupdate: true,
	originkill: false,
	zip: "/northstar.zip",
	lang: navigator.language,
	excludes: [
		"ns_startup_args.txt",
		"ns_startup_args_dedi.txt"
	]
}

// Sets the lang to the system default
ipcRenderer.send("setlang", settings.lang);

// Loads the settings
if (fs.existsSync("viper.json")) {
	let iteration = 0;

	// loads the config file, it's loaded in an interval like this in
	// case the config file is currently being written to, if we were to
	// read from the file during that, then it'd be empty or similar.
	//
	// and because of that, we check if the file is empty when loading
	// it, if so we wait 100ms, then check again, and we keep doing that
	// hoping it'll become normal again. unless we've checked it 50
	// times, then we simply give up, and force the user to re-select
	// the gamepath, as this'll make the config file readable again.
	//
	// ideally it'll never have to check those 50 times, it's only in
	// case something terrible has gone awry, like if a write got
	// interrupted, or a user messed with the file.
	//
	// were it to truly be broken, then it'd take up to 5 seconds to
	// then reset, this is basically nothing, especially considering
	// this should only happen in very rare cases... hopefully!
	let config_interval = setInterval(() => {
		iteration++;

		config = json("viper.json") || {};

		// checks whether `settings.gamepath` is set, and if so,
		// it'll attempt to load ns_startup_args.txt
		let parse_settings = () => {
			// if gamepath is not set, attempt to set it
			if (settings.gamepath.length === 0) {
				setpath(false);
			} else {
				// if the gamepath is set, we'll simply tell the main
				// process about it, and it'll then show the main
				// renderer BrowserWindow
				setpath(true);
			}

			// filepath to Northstar's startup args file
			let args = path.join(settings.gamepath, "ns_startup_args.txt");

			// check file exists
			if (fs.existsSync(args)) {
				// load file into `settings`
				settings.nsargs = fs.readFileSync(args, "utf8");
			}
		}

		// make sure config isn't empty
		if (Object.keys(config).length !== 0) {
			// add `config` to `settings`
			settings = {
				...settings,
				...config
			}; parse_settings();

			clearInterval(config_interval);
			return;
		}

		// we've attempted to load the config 50 times now, give up
		if (iteration >= 50) {
			// request a new gamepath be set
			setpath(false);
			clearInterval(config_interval);
		}
	}, 100)
} else {
	setpath();
}

ipcRenderer.on("changed-settings", (e, new_settings) => {
	// attempt to set `settings` to `new_settings`
	try {
		settings = {
			...settings,
			...new_settings
		}
	}catch(e) {}
})

// Show a toast message if no Internet connection has been detected.
if (! navigator.onLine) {
	ipcRenderer.send("no-internet");
}

function exit() {ipcRenderer.send("exit")}
function updateNorthstar() {ipcRenderer.send("update-northstar")}
function force_update_ns() {
	ipcRenderer.send("update-northstar", true);
}

function reset_config() {
	ipcRenderer.send("reset-config");
}

function open_gamepath() {
	let open_path = require("electron").shell.openPath;
	if (settings.gamepath) {
		open_path(settings.gamepath);
	} else {
		alert(lang("gui.settings.miscbuttons.open_gamepath_alert"));
	}
}

function relaunch() {
	ipcRenderer.send("relaunch");
}

// Reports to the main process about game path status.
// @param {boolean} value is game path loaded
function setpath(value = false) {
	ipcRenderer.send("setpath", value);
}

// Tells the main process to launch or install Northstar
function launch() {
	if (shouldInstallNorthstar) {
		updateNorthstar();
		shouldInstallNorthstar = false;
	} else {
		ipcRenderer.send("launch-ns");
	}
}

// Tells the main process to launch the vanilla game
function launchVanilla() {ipcRenderer.send("launch-vanilla")}

let log = console.log;

// Disables or enables certain buttons when for example
// updating/installing Northstar.
function setButtons(state, enable_gamepath_btns) {
	playNsBtn.disabled = !state;

	let disablearray = (array) => {
		for (let i = 0; i < array.length; i++) {
			array[i].disabled = ! state;

			if (state) {
				array[i].classList.remove("disabled")
			} else {
				array[i].classList.add("disabled")
			}
		}
	}

	disablearray(document.querySelectorAll("#modsdiv .el button"));
	disablearray(document.querySelectorAll(".disable-when-installing"));
	disablearray(document.querySelectorAll(".playBtnContainer .playBtn"));
	disablearray(document.querySelectorAll("#nsMods .buttons.modbtns button"));
	disablearray(document.querySelectorAll("#browser #browserEntries .text button"));

	if (enable_gamepath_btns) {
		let gamepath_btns = 
			document.querySelectorAll('*[onclick="setpath()"]');

		for (let i = 0; i < gamepath_btns.length; i++) {
			gamepath_btns[i].disabled = false;
			gamepath_btns[i].classList.remove("disabled");
		}
	}
}

ipcRenderer.on("set-buttons", (event, state) => {
	setButtons(state);
})

ipcRenderer.on("gamepath-lost", (event, state) => {
	page(0);
	setButtons(false, true);
	alert(lang("gui.gamepath.lost"));
})

// Frontend part of updating Northstar
ipcRenderer.on("ns-update-event", (event, key) => {
	document.getElementById("update").innerText = `(${lang(key)})`;
	console.log(lang(key));
	switch(key) {
		case "cli.update.uptodate_short":
		case "cli.update.no_internet":
			setButtons(true);
			playNsBtn.innerText = lang("gui.launch");
			break;
		default:
			setButtons(false);
			break;
	}
});

ipcRenderer.on("unknown-error", (event, err) => {
	new Toast({
		timeout: 10000,
		scheme: "error",
		title: lang("gui.toast.title.unknown_error"),
		description: lang("gui.toast.desc.unknown_error"),
		callback: () => {
			new Toast({
				timeout: 15000,
				scheme: "error",
				title: "",
				description: err.stack.replaceAll("\n", "<br>")
			})
		}
	})

	console.error(err.stack)
})

let installqueue = [];

// Tells the main process to install a mod through the file selector
function installmod() {
	setButtons(false);
	ipcRenderer.send("install-mod");
}

// Tells the main process to directly install a mod from this path
function installFromPath(path) {
	setButtons(false);
	ipcRenderer.send("install-from-path", path);
}

// Tells the main process to install a mod from a URL
function installFromURL(url, dependencies, clearqueue, author, package_name, version) {
	if (clearqueue) {installqueue = []};

	let prettydepends = [];

	if (dependencies) {
		let newdepends = [];
		for (let i = 0; i < dependencies.length; i++) {
			let depend = dependencies[i].toLowerCase();
			if (! depend.match(/northstar-northstar-.*/)) {
				depend = dependencies[i].replaceAll("-", "/");
				let pkg = depend.split("/");
				if (! isModInstalled(pkg[1])) {
					newdepends.push({
						pkg: depend,
						author: pkg[0],
						version: pkg[2],
						package_name: pkg[1]
					});

					prettydepends.push(`${pkg[1]} v${pkg[2]} - ${lang("gui.browser.made_by")} ${pkg[0]}`);
				}
			}
		}

		dependencies = newdepends;
	} 

	if (dependencies && dependencies.length != 0) {
		let confirminstall = confirm(lang("gui.mods.confirmdependencies") + prettydepends.join("\n"));
		if (! confirminstall) {
			return
		}
	}

	setButtons(false);
	ipcRenderer.send("install-from-url", url, author, package_name, version);

	if (dependencies) {
		installqueue = dependencies;
	}
}

function isModInstalled(modname) {
	for (let i = 0; i < modsobj.all.length; i++) {
		let mod = modsobj.all[i];
		if (mod.manifest_name) {
			if (mod.manifest_name.match(modname)) {
				return true;
			}
		} else if (mod.name.match(modname)) {
			return true;
		}
	}

	return false;
}

// Frontend part of settings a new game path
ipcRenderer.on("newpath", (event, newpath) => {
	setButtons(true);
	settings.gamepath = newpath;
	ipcRenderer.send("gui-getmods");
	ipcRenderer.send("save-settings", settings);
})

// Continuation of log()
ipcRenderer.on("log", (event, msg) => {log(msg)})
ipcRenderer.on("alert", (event, data) => {
	alert(data.message);
	ipcRenderer.send("alert-closed-" + data.id);
})

ipcRenderer.on("confirm", (event, data) => {
	let confirmed = confirm(data.message);
	ipcRenderer.send("confirm-closed-" + data.id, confirmed);
})

let is_running = false;
ipcRenderer.on("is-running", (event, running) => {
	let set_playbtns = (text) => {
		let playbtns = document.querySelectorAll(".playBtn");
		for (let i = 0; i < playbtns.length; i++) {
			playbtns[i].innerHTML = text;
		}
	}

	if (running && is_running != running) {
		setButtons(false);
		set_playbtns(lang("general.running"));

		is_running = running;

		update.setAttribute("onclick", "kill_game()");
		update.innerHTML = "(" + lang("ns.menu.force_quit") + ")";
		return;
	}

	if (is_running != running) {
		setButtons(true);
		set_playbtns(lang("gui.launch"));

		is_running = running;

		update.setAttribute("onclick", "updateNorthstar()");
		update.innerHTML = "(" + lang("gui.update.check") + ")";
	}
})

function kill_game() {
	ipcRenderer.send("kill-game");
}

function kill_origin() {
	ipcRenderer.send("kill-origin");
}

function delete_request_cache() {
	ipcRenderer.send("delete-request-cache");
}

function delete_install_cache() {
	ipcRenderer.send("delete-install-cache");
}

// Updates the installed mods
ipcRenderer.on("mods", (event, mods_obj) => {
	modsobj = mods_obj;
	if (! mods_obj) {return}

	mods.load(mods_obj);
})

// Updates version numbers
ipcRenderer.on("version", (event, versions) => {
	vpversion.innerText = versions.vp;
	nsversion.innerText = versions.ns;
	tf2Version.innerText = versions.tf2;

	if (versions.ns == "unknown") {
		let buttons = document.querySelectorAll(".modbtns button");

		for (let i = 0; i < buttons.length; i++) {
			buttons[i].disabled = true;
		}

		// Since Northstar is not installed, we cannot launch it
		shouldInstallNorthstar = true;
		playNsBtn.innerText = lang("gui.install");
	}
}); ipcRenderer.send("get-version");

// When an update is available it'll ask the user about it
ipcRenderer.on("update-available", () => {
	if (confirm(lang("gui.update.available"))) {
		ipcRenderer.send("update-now");
	}
})

// Error out when no game path is set
ipcRenderer.on("no-path-selected", () => {
	alert(lang("gui.gamepath.must"));
	exit();
});

// Error out when game path is wrong
ipcRenderer.on("wrong-path", () => {
	alert(lang("gui.gamepath.wrong"));
	setpath(false);
});

setlang();

let dragtimer;
document.addEventListener("dragover", (e) => {
    e.preventDefault();
    e.stopPropagation();
	dragUI.classList.add("shown");

	clearTimeout(dragtimer);
	dragtimer = setTimeout(() => {
		dragUI.classList.remove("shown");
	}, 5000)
});

document.addEventListener("mouseover", (e) => {
	clearTimeout(dragtimer);
	dragUI.classList.remove("shown");
});

document.addEventListener("drop", (e) => {
    event.preventDefault();
    event.stopPropagation();

	dragUI.classList.remove("shown");
	installFromPath(event.dataTransfer.files[0].path);
});

document.body.addEventListener("keyup", (e) => {
	if (e.key == "Escape") {
		Browser.toggle(false);
		Settings.toggle(false);
	}
})

document.body.addEventListener("click", event => {
	if (event.target.tagName.toLowerCase() === "a" && event.target.protocol != "file:") {
		event.preventDefault();
		shell.openExternal(event.target.href);
	}
});
