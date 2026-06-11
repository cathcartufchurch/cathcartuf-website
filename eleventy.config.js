const { marked } = require("marked");

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
            .sort((a, b) => new Date(a.date) - new Date(b.date));
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

                // Keep until end of following month
                const hideAfter = new Date(relevantDate);
                hideAfter.setMonth(hideAfter.getMonth() + 1);
                hideAfter.setDate(new Date(
                    hideAfter.getFullYear(),
                    hideAfter.getMonth() + 1,
                    0
                ).getDate());

                return hideAfter >= today;
            })
            .sort((a, b) => new Date(a.date) - new Date(b.date));
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

    // Sermons collection
    eleventyConfig.addCollection("sermons", function () {
        const fs = require("fs");
        const yaml = require("js-yaml");
        const path = require("path");
        const dir = path.join(__dirname, "_data/sermons");
        if (!fs.existsSync(dir)) return [];
        return fs.readdirSync(dir)
            .filter(file => file.endsWith(".yaml"))
            .map(file => yaml.load(
                fs.readFileSync(path.join(dir, file), "utf8")
            ));
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