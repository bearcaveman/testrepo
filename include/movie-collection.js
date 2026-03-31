/**
 * Movie collection UI: search, filter, sort — jQuery + jQuery Mobile.
 * Expects .movie-card tiles under .movie-grid and #searchForm fields.
 */
(function ($) {
	"use strict";

	var debounceTimer;
	var originalOrder = [];

	function norm(s) {
		return $.trim(String(s || "").toLowerCase().replace(/\s+/g, " "));
	}

	function rawField($card, sel) {
		var $n = $card.find(sel).first();
		if (!$n.length) {
			return "";
		}
		var el = $n[0];
		if (el.tagName === "INPUT" || el.tagName === "TEXTAREA") {
			return String(el.value != null ? el.value : "");
		}
		return String($n.text() || "");
	}

	/** Raw genre text from export: primary = foreach genres; fallback = genresAsString (TMM). */
	function genreExportText($c) {
		var primary = $.trim(rawField($c, ".m-genres"));
		if (primary.length) {
			return rawField($c, ".m-genres");
		}
		return rawField($c, ".m-genres-fallback");
	}

	/** Split TMM / NFO shapes: "A, B", "[A, B]", "A; B", legacy pipes. */
	function parseGenreLabels(raw) {
		var s = String(raw || "").replace(/^\s*\[|\]\s*$/g, "");
		var parts = s.split(/[,;|]/);
		var out = [];
		$.each(parts, function (_, p) {
			var t = $.trim(p);
			if (t) {
				out.push(t);
			}
		});
		return out;
	}

	function genreHaystackChunk($c) {
		return $.map(parseGenreLabels(genreExportText($c)), function (lab) {
			return norm(lab);
		}).join(" ");
	}

	function getYearStr($card) {
		var y = $.trim(rawField($card, ".m-year").replace(/\s+/g, ""));
		if (y) {
			return norm(y);
		}
		var t = $card.find(".desc").first().text() || "";
		var m = /\((\d{4})\)\s*$/.exec($.trim(t));
		return m ? norm(m[1]) : "";
	}

	/**
	 * Prefer data-added-key (yyyy-MM-dd from export, digits only for compare) — avoids Date.parse on Android WebView.
	 * Then ISO span, then data-added string fallbacks.
	 */
	function parseAddedMs($c) {
		var dk = $c.attr("data-added-key");
		if (dk) {
			var num = parseInt(String(dk).replace(/\D/g, ""), 10);
			if (!isNaN(num) && num >= 19000101 && num <= 29991231) {
				var y = Math.floor(num / 10000);
				var mo = Math.floor((num % 10000) / 100);
				var d = num % 100;
				if (mo >= 1 && mo <= 12 && d >= 1 && d <= 31) {
					return Date.UTC(y, mo - 1, d);
				}
			}
		}
		var iso = $.trim(rawField($c, ".m-added-iso"));
		var p = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
		if (p) {
			return Date.UTC(parseInt(p[1], 10), parseInt(p[2], 10) - 1, parseInt(p[3], 10));
		}
		var da = $c.find("a.movie-link").attr("data-added");
		if (da) {
			var t = Date.parse(da);
			if (!isNaN(t)) {
				return t;
			}
		}
		return NaN;
	}

	function addedKeyNum($c) {
		return parseInt(String($c.attr("data-added-key") || "").replace(/\D/g, ""), 10) || 0;
	}

	function parseImdbNum($c) {
		var s = $.trim(rawField($c, ".m-imdb"));
		if (!s) {
			return NaN;
		}
		var n = parseFloat(s.replace(",", "."));
		return isNaN(n) ? NaN : n;
	}

	function parseYearNum(s) {
		var n = parseInt(s, 10);
		return isNaN(n) ? 0 : n;
	}

	function buildHaystack($card) {
		return norm(
			[
				rawField($card, ".m-title"),
				rawField($card, ".m-actors"),
				genreHaystackChunk($card),
				getYearStr($card),
				rawField($card, ".m-rating"),
				rawField($card, ".m-imdb"),
				rawField($card, ".m-plot"),
			].join(" ")
		);
	}

	function tokensAllMatch(hay, q) {
		if (!q) {
			return true;
		}
		var parts = $.grep(q.split(/\s+/), function (p) {
			return p.length > 0;
		});
		if (!parts.length) {
			return true;
		}
		for (var i = 0; i < parts.length; i++) {
			if (hay.indexOf(parts[i]) < 0) {
				return false;
			}
		}
		return true;
	}

	function ensureCardMeta($c) {
		if ($c.data("mcMeta")) {
			return $c.data("mcMeta");
		}
		var titleLc = norm(rawField($c, ".m-title"));
		var titleRaw = $.trim(rawField($c, ".m-title"));
		var yearStr = getYearStr($c);
		var genreListLc = $.map(parseGenreLabels(genreExportText($c)), function (lab) {
			return norm(lab);
		});
		var meta = {
			haystack: buildHaystack($c),
			titleLc: titleLc,
			titleRaw: titleRaw,
			actorsLc: norm(rawField($c, ".m-actors")),
			genreListLc: genreListLc,
			yearStr: yearStr,
			yearNum: parseYearNum(yearStr),
			watched: norm(rawField($c, ".m-watched")),
			pathLc: norm(rawField($c, ".m-path")),
			certLc: norm(rawField($c, ".m-rating")),
			addedMs: parseAddedMs($c),
			imdbNum: parseImdbNum($c),
		};
		$c.data("mcMeta", meta);
		return meta;
	}

	function initCardCache($grid) {
		$grid.find(".movie-card").each(function () {
			ensureCardMeta($(this));
		});
	}

	function captureOriginalOrder($grid) {
		originalOrder = $grid.children(".movie-card").get();
	}

	function rebuildGenres() {
		var byNorm = {};
		$(".movie-card").each(function () {
			var labels = parseGenreLabels(genreExportText($(this)));
			$.each(labels, function (_, lab) {
				var n = norm(lab);
				if (n && !Object.prototype.hasOwnProperty.call(byNorm, n)) {
					byNorm[n] = lab;
				}
			});
		});
		var pairs = $.map(byNorm, function (label, n) {
			return { label: label, n: n };
		});
		pairs.sort(function (a, b) {
			try {
				return a.label.localeCompare(b.label, undefined, { sensitivity: "base" });
			} catch (e0) {
				return a.label.localeCompare(b.label);
			}
		});
		var $sel = $("#search_genres");
		var $first = $sel.find("option:first").clone();
		$sel.empty().append($first);
		$.each(pairs, function (_, p) {
			$sel.append($("<option/>").attr("value", p.label).text(p.label));
		});
		try {
			$sel.selectmenu("refresh");
		} catch (e1) {}
	}

	function rebuildRatings() {
		var seen = {};
		$(".movie-card").each(function () {
			var r = $.trim(rawField($(this), ".m-rating"));
			if (r) {
				seen[r] = true;
			}
		});
		var list = $.map(seen, function (_, k) {
			return k;
		}).sort(function (a, b) {
			return a.toLowerCase().localeCompare(b.toLowerCase());
		});
		var $sel = $("#search_rating");
		var $first = $sel.find("option:first").clone();
		$sel.empty().append($first);
		$.each(list, function (_, r) {
			$sel.append($("<option/>").attr("value", r).text(r));
		});
		try {
			$sel.selectmenu("refresh");
		} catch (e2) {}
	}

	function recentDaysLabel(v) {
		var n = parseInt(v, 10);
		if (isNaN(n) || n <= 0) {
			return "Any time";
		}
		if (n === 1) {
			return "Last 1 day";
		}
		return "Last " + n + " days";
	}

	function applyFilters() {
		var $f = $("#searchForm");
		var quick = norm($f.find("#quicksearch").val());
		var titleQ = norm($f.find("#moviename").val());
		var actorQ = norm($f.find("#actorname").val());
		var yearQ = norm($f.find("#yearfilter").val());
		var st = $f.find("#search_newmovie").val();
		var must = $f.find("#search_path").val();
		var rating = norm($f.find("#search_rating").val());
		var genre = norm($f.find("#search_genres").val());
		var recentDays = parseInt($f.find("#recentDays").val(), 10) || 0;
		var minImdb = parseFloat(String($f.find("#minImdb").val()).replace(",", "."));

		var n = 0;
		$(".movie-card").each(function () {
			var $c = $(this);
			var m = ensureCardMeta($c);
			var show = true;

			if (quick && !tokensAllMatch(m.haystack, quick)) {
				show = false;
			}
			if (show && titleQ && !tokensAllMatch(m.titleLc, titleQ)) {
				show = false;
			}
			if (show && actorQ && m.actorsLc.indexOf(actorQ) < 0) {
				show = false;
			}
			if (show && yearQ && m.yearStr.indexOf(yearQ) < 0) {
				show = false;
			}
			if (show && st && m.watched !== norm(st)) {
				show = false;
			}
			if (show && must) {
				var isMust = m.pathLc.indexOf("must see") >= 0;
				if (must === "yes" && !isMust) {
					show = false;
				}
				if (must === "no" && isMust) {
					show = false;
				}
			}
			if (show && rating && m.certLc !== rating) {
				show = false;
			}
			if (show && genre && $.inArray(genre, m.genreListLc) < 0) {
				show = false;
			}
			if (show && recentDays > 0) {
				if (isNaN(m.addedMs)) {
					show = false;
				} else {
					var cutoff = Date.now() - recentDays * 86400000;
					if (m.addedMs < cutoff) {
						show = false;
					}
				}
			}
			if (show && !isNaN(minImdb) && minImdb > 0) {
				if (isNaN(m.imdbNum) || m.imdbNum < minImdb) {
					show = false;
				}
			}

			$c.toggle(show);
			if (show) {
				n++;
			}
		});

		$("#numMovies").text(n + " Movies");
		try {
			$("#footer").trigger("updatelayout");
		} catch (e3) {}
	}

	function scheduleApply() {
		clearTimeout(debounceTimer);
		debounceTimer = setTimeout(applyFilters, 120);
	}

	function applySort(mode) {
		mode = String(mode || "").trim() || "added-desc";
		var $grid = $(".movie-grid");
		if (!$grid.length) {
			return;
		}

		if (mode === "export") {
			$.each(originalOrder, function (_, el) {
				$grid.append(el);
			});
			return;
		}

		var cards = $grid.children(".movie-card").get();
		cards.sort(function (a, b) {
			var $a = $(a);
			var $b = $(b);
			var ma = ensureCardMeta($a);
			var mb = ensureCardMeta($b);
			if (mode === "title-asc") {
				try {
					return ma.titleRaw.localeCompare(mb.titleRaw, undefined, { sensitivity: "base" });
				} catch (e) {
					return ma.titleRaw.localeCompare(mb.titleRaw);
				}
			}
			if (mode === "title-desc") {
				try {
					return mb.titleRaw.localeCompare(ma.titleRaw, undefined, { sensitivity: "base" });
				} catch (e2) {
					return mb.titleRaw.localeCompare(ma.titleRaw);
				}
			}
			if (mode === "year-desc") {
				return mb.yearNum - ma.yearNum;
			}
			if (mode === "year-asc") {
				return ma.yearNum - mb.yearNum;
			}
			if (mode === "added-desc") {
				var naMs = isNaN(ma.addedMs);
				var nbMs = isNaN(mb.addedMs);
				if (naMs && nbMs) {
					return addedKeyNum($b) - addedKeyNum($a);
				}
				if (naMs) {
					return 1;
				}
				if (nbMs) {
					return -1;
				}
				return mb.addedMs - ma.addedMs;
			}
			if (mode === "imdb-desc") {
				if (isNaN(ma.imdbNum)) {
					return 1;
				}
				if (isNaN(mb.imdbNum)) {
					return -1;
				}
				return mb.imdbNum - ma.imdbNum;
			}
			return 0;
		});
		$.each(cards, function (_, el) {
			$grid.append(el);
		});
	}

	function refreshFooterCountAll() {
		var total = $(".movie-card").length;
		$("#numMovies").text(total + " Movies");
		try {
			$("#footer").trigger("updatelayout");
		} catch (e4) {}
	}

	function bindPage() {
		var $grid = $(".movie-grid");
		initCardCache($grid);
		captureOriginalOrder($grid);
		applySort($("#sortOrder").val() || "added-desc");
		try {
			$("#sortOrder").selectmenu("refresh");
		} catch (eSort) {}
		rebuildGenres();
		rebuildRatings();
		refreshFooterCountAll();
		applyFilters();

		var $page = $("#AllMovies");

		$("#recentDaysOut").text(recentDaysLabel($("#recentDays").val()));

		/* Native <select> change: delegate from form (works on Android; jQM selectmenu often does not). */
		$("#searchForm")
			.off(".mcSel")
			.on("change.mcSel", "select", function () {
				if (this.id === "sortOrder") {
					applySort($(this).val());
				}
				applyFilters();
			});

		$page
			.off(".mc")
			.on("input.mc change.mc", "#quicksearch, #moviename, #actorname, #yearfilter", scheduleApply)
			.on("input.mc change.mc touchend.mc", "#recentDays", function () {
				$("#recentDaysOut").text(recentDaysLabel($(this).val()));
				scheduleApply();
			})
			.off("click.mcBtn", "#filter, #reset, #random")
			.on("click.mcBtn", "#filter, #reset, #random", function (e) {
				e.preventDefault();
				var id = this.id;
				if (id === "filter") {
					applyFilters();
				} else if (id === "reset") {
					window.goReset();
				} else if (id === "random") {
					window.goRandom();
				}
				return false;
			});

		/* WebView timing: re-apply default sort after layout (fixes wrong initial order on some phones). */
		setTimeout(function () {
			applySort($("#sortOrder").val() || "added-desc");
			applyFilters();
		}, 150);

		$(document).off(".mcFocus").on("keydown.mcFocus", function (e) {
			var tag = (e.target && e.target.tagName) || "";
			if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || tag === "BUTTON") {
				return;
			}
			if (e.which === 191 && !e.shiftKey) {
				e.preventDefault();
				$("#quicksearch").trigger("focus");
			}
		});

		$page.on("keydown.mc", "#quicksearch", function (e) {
			if (e.which === 27) {
				$(this).val("");
				applyFilters();
			}
		});

		try {
			$("#filterPanel").collapsible({ collapsed: true });
		} catch (e5) {}
	}

	window.goSearch = function () {
		applyFilters();
		return false;
	};

	window.goReset = function () {
		var f = document.searchForm;
		if (!f) {
			return false;
		}
		f.moviename.value = "";
		f.actorname.value = "";
		if (f.quicksearch) {
			f.quicksearch.value = "";
		}
		if (f.yearfilter) {
			f.yearfilter.value = "";
		}
		if (f.minImdb) {
			f.minImdb.value = "";
			try {
				$(f.minImdb).selectmenu("refresh");
			} catch (eMin) {}
		}
		if (f.recentDays) {
			f.recentDays.value = "0";
		}
		$("#recentDaysOut").text(recentDaysLabel(0));
		f.search_newmovie.value = "";
		f.search_path.value = "";
		f.search_rating.value = "";
		f.search_genres.value = "";
		var $sort = $("#sortOrder");
		$sort.val("added-desc");
		try {
			$sort.selectmenu("refresh");
		} catch (e9) {}
		applySort("added-desc");
		$(".movie-card").show();
		refreshFooterCountAll();
		try {
			$("#footer").trigger("updatelayout");
		} catch (e6) {}
		return false;
	};

	window.goRandom = function () {
		var pool = [];
		$(".movie-card").each(function () {
			var $c = $(this);
			var m = ensureCardMeta($c);
			if (m.pathLc.indexOf("must see") >= 0) {
				pool.push(this);
			}
		});
		$(".movie-card").hide();
		if (!pool.length) {
			$("#numMovies").text("0 Movies (no must-see)");
			try {
				$("#footer").trigger("updatelayout");
			} catch (e7) {}
			return false;
		}
		var pick = pool[Math.floor(Math.random() * pool.length)];
		$(pick).show();
		$("#numMovies").text("1 Movies");
		try {
			$("#footer").trigger("updatelayout");
		} catch (e8) {}
		return false;
	};

	var pageBound = false;
	function bindPageOnce() {
		if (pageBound || !$("#AllMovies").find(".movie-card").length) {
			return;
		}
		pageBound = true;
		bindPage();
	}

	$(document).on("pageinit", "#AllMovies", bindPageOnce);
	$(function () {
		bindPageOnce();
	});
})(jQuery);
