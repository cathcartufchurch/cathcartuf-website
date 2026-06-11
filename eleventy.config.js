module.exports = function(eleventyConfig) {
    eleventyConfig.addPassthroughCopy("assets");
    eleventyConfig.addPassthroughCopy("admin");
    eleventyConfig.addPassthroughCopy("api");

    // Ignore documentation and backup files
    eleventyConfig.ignores.add("AZURE-LESSONS-LEARNED.md");
    eleventyConfig.ignores.add("README.md");
    eleventyConfig.ignores.add("_backups/**");

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