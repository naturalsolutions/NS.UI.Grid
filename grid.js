/*
 * Grid view
 */

var NS = window.NS || {};

NS.UI = (function(ns) {
    "use strict";

    var GridRow = eCollection.utilities.BaseView.extend({
        template: 'gridrow',

        initialize: function() {
            this.listenTo(this.model, 'change', this.render);
        },

        serialize: function() {
            var viewData = {};
            viewData.attr = this.model.attributes;
            viewData.actions = _.extend({}, this.model.getLocalURLs());
            return viewData;
        }
    });

    var Pager = eCollection.utilities.BaseView.extend({
        template: 'pager',

        // Config
        maxIndexButtons: 7, // number of index button to show

        serialize: function() {
            var c = this.collection;

            // Default view data
            var viewData = {
                baseUrl: '#sample/list/p',
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


            // Read view state
            if (c.limit) {
                if (c.totalCount) { viewData.lastPage = Math.ceil(c.totalCount / c.limit);}
                var startIndexPage = Math.floor(c.skip / c.limit);
                var endIndexPage = Math.floor((c.skip + c.localCount - 1) / c.limit);
                if (startIndexPage == endIndexPage) {
                    viewData.currentPage = startIndexPage + 1;
                } else {
                    viewData.currentPage = null;
                }
            }

            // Adapt to the current collection state if it is known
            if (viewData.currentPage !== null) {
                // Decide what to do with arrow buttons
                if (viewData.currentPage > viewData.firstPage) {
                    viewData.activeFirst = true;
                    viewData.activePrevious = true;
                }
                if (viewData.lastPage !== null && viewData.currentPage < viewData.lastPage) {
                    viewData.activeLast = true;
                    viewData.activeNext = true;
                }
                // Compute a window for indexes
                viewData.windowStart = viewData.currentPage - Math.floor(this.maxIndexButtons/2);
                viewData.windowEnd = viewData.currentPage + Math.floor(this.maxIndexButtons/2) + this.maxIndexButtons % 2 - 1;
                if (viewData.windowStart < viewData.firstPage) {
                    viewData.windowEnd += viewData.firstPage - viewData.windowStart;
                    viewData.windowStart = viewData.firstPage;
                }
                if (viewData.windowEnd > viewData.lastPage) {
                    var offset = viewData.windowEnd - viewData.lastPage;
                    if (viewData.windowStart > viewData.firstPage + offset) viewData.windowStart -= offset;
                    viewData.windowEnd = viewData.lastPage;
                }
                // Append/Prepend dots where necessary
                viewData.showRightDots = viewData.windowEnd < viewData.lastPage;
                viewData.showLeftDots = viewData.windowStart > viewData.firstPage;
            } else if (viewData.lastPage !== null) {
                // When collection count is known but currentPage can't be computed (not probable)
                 viewData.windowEnd = (this.maxIndexButtons < viewData.lastPage) ? this.maxIndexButtons : viewData.lastPage;
            }

            return viewData;
        }
    });

    ns.Grid = eCollection.utilities.BaseView.extend({
        template: 'grid',

        serialize: function() {
            return {
                // We purposely use chain() here, so that titles.each() can be used in the template code
                titles: _.chain(this.collection.model.prototype.schema).pluck('title')
            };
        },

        initialize: function() {
            this.listenTo(this.collection, 'reset', this.render);
        },

        beforeRender: function() {
            this.insertView(new Pager({collection: this.collection}));
            this.collection.each(function(item) {
                this.insertView('tbody', new GridRow({model: item}));
            }, this);
        }
    });

    return ns;
})(NS.UI || {});