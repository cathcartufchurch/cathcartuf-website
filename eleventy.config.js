const { marked } = require("marked");

// Helper to parse time strings like "8:30am", "10:30am", "11am" into minutes
function parseTime(timeStr) {
    if (!timeStr) return 0;
    const match = timeStr.match(/(\d+)(?::(\d+))?(am|pm)?/i);
    if (!match) return 0;
    let hours = parseInt(match[1]);
    const minutes = parseInt(match[2] || 0);
    const period = (match[3] || "am").toLowerCase();
    if (period === "pm" && hours !== 12) hours += 12;
    if (period === "am" && hours === 12) hours = 0;
    return hours * 60 + minutes;
}

module.exports = function (eleventyConfig) {

    // ─── Passthrough Copies ────────────────────────────────────────
    eleventyConfig.addPassthroughCopy("assets");
    eleventyConfig.addPassthroughCopy("admin");
    eleventyConfig.addPassthroughCopy("api");

    // ─── Ignores ───────────────────────────────────────────────────
    eleventyConfig.ignores.add("AZURE-LESSONS-LEARNED.md");
    eleventyConfig.ignores.add("README.md");
    eleventyConfig.ignores.add("_backups/**");

    // ─── Date Filters ──────────────────────────────────────────────

    // Full date e.g. "8 June 2026"
    eleventyConfig.addFilter("dateFormat", function (date) {
        return new Date(date).toLocaleDateString("en-GB", {
            day: "numeric",
            month: "long",
            year: "numeric"
        });
    });

    // Day number only e.g. "8"
    eleventyConfig.addFilter("dateDay", function (date) {
        return new Date(date).getDate();
    });

    // Short month only e.g. "Jun"
    eleventyConfig.addFilter("dateMonth", function (date) {
        return new Date(date).toLocaleDateString("en-GB", { month: "short" });
    });

    // Month and year e.g. "June 2026"
    eleventyConfig.addFilter("dateMonthYear", function (date) {
        return new Date(date).toLocaleDateString("en-GB", { month: "long", year: "numeric" });
    });

    // ─── Utility Filters ───────────────────────────────────────────

    // Limit array length
    eleventyConfig.addFilter("limit", function (array, limit) {
        return array.slice(0, limit);
    });

    // Render markdown content
    eleventyConfig.addFilter("markdown", function (content) {
        if (!content) return "";
        return marked(content);
    });

    // Extract YouTube video ID from full URL
    // e.g. "https://www.youtube.com/watch?v=Buz2nbdTc6s" → "Buz2nbdTc6s"
    eleventyConfig.addFilter("youtubeId", function (url) {
        if (!url) return "";
        const match = url.match(/(?:v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
        return match ? match[1] : "";
    });

    // ─── News Filters ──────────────────────────────────────────────

    // Active news items only, newest first
    eleventyConfig.addFilter("activeNews", function (newsItems) {
        if (!newsItems) return [];
        return newsItems
            .filter(item => item.active === true)
            .sort((a, b) => {
                // Pinned items first
                if (a.pinned && !b.pinned) return -1;
                if (!a.pinned && b.pinned) return 1;
                // Then by date descending
                return new Date(b.date) - new Date(a.date);
            });
    });

    // ─── Event Filters ─────────────────────────────────────────────

    // Future events only (for homepage Coming Up)
    eleventyConfig.addFilter("futureEvents", function (events) {
        if (!events) return [];
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        return events
            .filter(event => {
                const relevantDate = event.endDate
                    ? new Date(event.endDate)
                    : new Date(event.date);
                return relevantDate >= today;
            })
            .sort((a, b) => {
                const dateCompare = new Date(a.date) - new Date(b.date);
                if (dateCompare !== 0) return dateCompare;
                return parseTime(a.startTime) - parseTime(b.startTime);
            });
    });
    // Current events - future + until end of following month (for events page)
    eleventyConfig.addFilter("currentEvents", function (events) {
        if (!events) return [];
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        return events
            .filter(event => {
                const relevantDate = event.endDate
                    ? new Date(event.endDate)
                    : new Date(event.date);

                const hideAfter = new Date(relevantDate);
                hideAfter.setMonth(hideAfter.getMonth() + 1);
                hideAfter.setDate(new Date(
                    hideAfter.getFullYear(),
                    hideAfter.getMonth() + 1,
                    0
                ).getDate());

                return hideAfter >= today;
            })
            .sort((a, b) => {
                const dateCompare = new Date(a.date) - new Date(b.date);
                if (dateCompare !== 0) return dateCompare;
                return parseTime(a.startTime) - parseTime(b.startTime);
            });
    });
    // Services filter — last 6 months, newest first (for Watch page)
    eleventyConfig.addFilter("recentServices", function (services) {
        if (!services) return [];
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const sixMonthsAgo = new Date();
        sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

        return services
            .filter(service => {
                if (!service.youtube) return false;
                const serviceDate = new Date(service.date);
                return serviceDate >= sixMonthsAgo && serviceDate <= today;
            })
            .sort((a, b) => new Date(b.date) - new Date(a.date));
    });

    // ─── Collections ───────────────────────────────────────────────

    // News collection
    eleventyConfig.addCollection("news", function () {
        const fs = require("fs");
        const yaml = require("js-yaml");
        const path = require("path");
        const dir = path.join(__dirname, "_data/news");
        if (!fs.existsSync(dir)) return [];
        return fs.readdirSync(dir)
            .filter(file => file.endsWith(".yaml"))
            .map(file => yaml.load(
                fs.readFileSync(path.join(dir, file), "utf8")
            ));
    });

    // Events collection
    eleventyConfig.addCollection("events", function () {
        const fs = require("fs");
        const yaml = require("js-yaml");
        const path = require("path");
        const dir = path.join(__dirname, "_data/events");
        if (!fs.existsSync(dir)) return [];
        return fs.readdirSync(dir)
            .filter(file => file.endsWith(".yaml"))
            .map(file => yaml.load(
                fs.readFileSync(path.join(dir, file), "utf8")
            ));
    });

    // Watch collection
    eleventyConfig.addCollection("watch", function () {
        const fs = require("fs");
        const yaml = require("js-yaml");
        const path = require("path");
        const dir = path.join(__dirname, "_data/watch");
        if (!fs.existsSync(dir)) return [];
        return fs.readdirSync(dir)
            .filter(file => file.endsWith(".yaml"))
            .map(file => yaml.load(
                fs.readFileSync(path.join(dir, file), "utf8")
            ));
    });

    // Series colours lookup — maps series name to colour
    eleventyConfig.addCollection("seriesColours", function () {
        const fs = require("fs");
        const yaml = require("js-yaml");
        const path = require("path");
        const file = path.join(__dirname, "_data/watch/series.yaml");
        if (!fs.existsSync(file)) return {};
        const series = yaml.load(fs.readFileSync(file, "utf8"));
        const lookup = {};
        series.forEach(s => {
            lookup[s.name] = s.colour;
        });
        return lookup;
    });

    // ─── Return Config ─────────────────────────────────────────────
    return {
        htmlTemplateEngine: false,
        markdownTemplateEngine: "njk",
        templateFormats: ["html", "njk", "md"],
        dir: {
            input: ".",
            output: "_site",
            includes: "_includes",
            data: "_data"
        }
    };
};