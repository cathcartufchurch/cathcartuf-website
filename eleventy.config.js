module.exports = function(eleventyConfig) {
    // Copy static assets as-is
    eleventyConfig.addPassthroughCopy("assets");
    eleventyConfig.addPassthroughCopy("admin");
    eleventyConfig.addPassthroughCopy("api");

    return {
        dir: {
            input: ".",
            output: "_site",
            includes: "_includes",
            data: "_data"
        }
    };
};