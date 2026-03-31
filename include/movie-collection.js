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

	function genresNorm(s) {
		return norm(s).replace(/^\[/, "").replace(/\]$/, "").replace(/,/g, " ");
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

	function parseYearNum(s) {
		var n = parseInt(s, 10);
		return isNaN(n) ? 0 : n;
	}

	function buildHaystack($card) {
		return norm(
			[
				rawField($card, ".m-title"),
				rawField($card, ".m-actors"),
				genresNorm(rawField($card, ".m-genres")),
				getYearStr($card),
				rawField($card, ".m-rating"),
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

	function initCardCache($grid) {
		$grid.find(".movie-card").each(function () {
			var $c = $(this);
			if ($c.data("mcMeta")) {
				return;
			}
			var titleLc = norm(rawField($c, ".m-title"));
			var titleRaw = $.trim(rawField($c, ".m-title"));
			var yearStr = getYearStr($c);
			$c.data("mcMeta", {
				haystack: buildHaystack($c),
				titleLc: titleLc,
				titleRaw: titleRaw,
				actorsLc: norm(rawField($c, ".m-actors")),
				genresLc: genresNorm(rawField($c, ".m-genres")),
				yearStr: yearStr,
				yearNum: parseYearNum(yearStr),
				watched: norm(rawField($c, ".m-watched")),
				pathLc: norm(rawField($c, ".m-path")),
				certLc: norm(rawField($c, ".m-rating")),
			});
		});
	}

	function captureOriginalOrder($grid) {
		originalOrder = $grid.children(".movie-card").get();
	}

	function rebuildGenres() {
		var seen = {};
		$(".movie-card").each(function () {
			var g = rawField($(this), ".m-genres");
			g = g.replace(/^\s*\[|\]\s*$/g, "");
			$.each(g.split(","), function (_, part) {
				var t = $.trim(part);
				if (t) {
					seen[t] = true;
				}
			});
		});
		var list = $.map(seen, function (_, k) {
			return k;
		}).sort();
		var $sel = $("#search_genres");
		var $first = $sel.find("option:first").clone();
		$sel.empty().append($first);
		$.each(list, function (_, g) {
			$sel.append($("<option/>").attr("value", g).text(g));
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

		var n = 0;
		$(".movie-card").each(function () {
			var $c = $(this);
			var m = $c.data("mcMeta");
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
			if (show && genre && m.genresLc.indexOf(genre) < 0) {
				show = false;
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
		var $grid = $(".movie-grid");
		if (!$grid.length) {
			return;
		}

		if (mode === "export" || !mode) {
			$.each(originalOrder, function (_, el) {
				$grid.append(el);
			});
			return;
		}

		var cards = $grid.children(".movie-card").get();
		cards.sort(function (a, b) {
			var $a = $(a);
			var $b = $(b);
			var ma = $a.data("mcMeta");
			var mb = $b.data("mcMeta");
			if (!ma || !mb) {
				return 0;
			}
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
		rebuildGenres();
		rebuildRatings();
		refreshFooterCountAll();
		applyFilters();

		var $page = $("#AllMovies");

		$page
			.off(".mc")
			.on("input.mc change.mc", "#quicksearch, #moviename, #actorname, #yearfilter", scheduleApply)
			.on("change.mc", "#search_newmovie, #search_path, #search_rating, #search_genres", applyFilters)
			.on("change.mc", "#sortOrder", function () {
				applySort($(this).val());
				applyFilters();
			});

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
			$("#filterPanel").collapsible({ collapsed: false });
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
		f.search_newmovie.value = "";
		f.search_path.value = "";
		f.search_rating.value = "";
		f.search_genres.value = "";
		var $sort = $("#sortOrder");
		$sort.val("export");
		try {
			$sort.selectmenu("refresh");
		} catch (e9) {}
		applySort("export");
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
			var m = $c.data("mcMeta");
			if (m && m.pathLc.indexOf("must see") >= 0) {
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
