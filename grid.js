/*
 * Grid view
 */

var NS = window.NS || {};

NS.UI = (function(ns) {
    "use strict";

    var GridRow = eCollection.utilities.BaseView.extend({
        template: 'gridrow',

        initialize: function() {
            eCollection.utilities.BaseView.prototype.initialize.apply(this, arguments);
            this.listenTo(this.model, 'change', this.render);
        },

        serialize: function() {
            var viewData = {};
            viewData.attr = this.model.attributes;
            viewData.actions = _.extend({}, this.model.getLocalURLs());
            return viewData;
        }
    });

    ns.Grid = eCollection.utilities.BaseView.extend({
        template: 'grid',

        // Config
        maxIndexButtons: 7, // number of index button to show

        initialize: function(options) {
            eCollection.utilities.BaseView.prototype.initialize.apply(this, arguments);
            this.listenTo(this.collection, 'reset', this.render);
            this.baseUrl = options.baseUrl || '#';
        },

        buildUrl: function(page) {
            return this.baseUrl + 'p' + page;
        },

        serialize: function() {
            var c = this.collection;

            // Default view data
            var pagerData = {
                firstPage: 1,
                lastPage: null,
                currentPage: null,
                windowStart: 1,
                windowEnd: this.maxIndexButtons,
                activeFirst: false,
                activePrevious: false,
                activeNext: false,
                activeLast: false,
                showLeftDots: false,
                showRightDots: true
            };


            // Infere view state form the collection state
            if (c.limit) {
                if (c.totalCount) { pagerData.lastPage = Math.ceil(c.totalCount / c.limit);}
                var startIndexPage = Math.floor(c.skip / c.limit);
                var endIndexPage = Math.floor((c.skip + c.localCount - 1) / c.limit);
                if (startIndexPage == endIndexPage) {
                    pagerData.currentPage = startIndexPage + 1;
                } else {
                    pagerData.currentPage = null;
                }
            }

            // Adapt to the current collection state if it is known
            if (pagerData.currentPage !== null) {
                // Decide what to do with arrow buttons
                if (pagerData.currentPage > pagerData.firstPage) {
                    pagerData.activeFirst = true;
                    pagerData.activePrevious = true;
                }
                if (pagerData.lastPage !== null && pagerData.currentPage < pagerData.lastPage) {
                    pagerData.activeLast = true;
                    pagerData.activeNext = true;
                }
                // Compute a window for indexes
                pagerData.windowStart = pagerData.currentPage - Math.floor(this.maxIndexButtons/2);
                pagerData.windowEnd = pagerData.currentPage + Math.floor(this.maxIndexButtons/2) + this.maxIndexButtons % 2 - 1;
                if (pagerData.windowStart < pagerData.firstPage) {
                    pagerData.windowEnd += pagerData.firstPage - pagerData.windowStart;
                    pagerData.windowStart = pagerData.firstPage;
                }
                if (pagerData.windowEnd > pagerData.lastPage) {
                    var offset = pagerData.windowEnd - pagerData.lastPage;
                    if (pagerData.windowStart > pagerData.firstPage + offset) pagerData.windowStart -= offset;
                    pagerData.windowEnd = pagerData.lastPage;
                }
                // Append/Prepend dots where necessary
                pagerData.showRightDots = pagerData.windowEnd < pagerData.lastPage;
                pagerData.showLeftDots = pagerData.windowStart > pagerData.firstPage;
            } else if (pagerData.lastPage !== null) {
                // When collection count is known but currentPage can't be computed (not probable)
                 pagerData.windowEnd = (this.maxIndexButtons < pagerData.lastPage) ? this.maxIndexButtons : pagerData.lastPage;
            }

            return {
                buildUrl: $.proxy(this.buildUrl, this),
                // We purposely use chain() here, so that titles.each() can be used in the template code
                titles: _.chain(this.collection.model.prototype.schema).pluck('title'),
                pager: pagerData
            };
        },

        beforeRender: function() {
            this.collection.each(function(item) {
                this.insertView('tbody', new GridRow({model: item}));
            }, this);
        }
    });

    return ns;
})(NS.UI || {});