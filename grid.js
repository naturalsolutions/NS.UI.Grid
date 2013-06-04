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
            viewData.attr = this.model.getFlatAttrs();
            viewData.actions = _.extend({}, this.model.getLocalURLs());
            return viewData;
        }
    });

    ns.Grid = eCollection.utilities.BaseView.extend({
        template: 'grid',

        events: {
            'click th.sortable': 'onSort',
            'change .grid-page-selector select': 'onPageRedim',
            'change .grid-filter select': 'onFilter'
        },

        // Config
        maxIndexButtons: 7, // number of index button to show
        pageSizes: [10, 15, 25, 50],

        initialize: function(options) {
            eCollection.utilities.BaseView.prototype.initialize.apply(this, arguments);
            this.listenTo(this.collection, 'reset', this.render);
            this.baseUrl = options.baseUrl || '#';
            this.sortColumn = options.sortColumn;
            this.sortOrder = options.sortOrder;
            this.filterOptions = options.filterOptions || [];
            this.currentFilter = options.currentFilter || '';
        },

        buildUrl: function(params) {
            params = params || {};
            var options = {
                page: params.page || this.currentPage,
                pageSize: params.pageSize || this.pageSize,
            };
            var sortColumn = params.sortColumn || this.sortColumn;
            var sortOrder = params.sortOrder || this.sortOrder || 'asc';
            if (typeof(sortColumn) !== 'undefined') {
                options.sortColumn = sortColumn;
                options.sortOrder = sortOrder;
            }
            var currentFilter = ('filter' in params) ? params.filter : this.currentFilter;
            if (currentFilter != '') options.filter = currentFilter;
            return this.baseUrl + '?' + $.param(options);
        },

        _getSubHeaders: function(schema, prefix) {
            var context = {
                grid: this,
                prefix: prefix,
                subDepth: 0
            }, sub = {
                headers: _.map(schema, function(field, id) {
                    var header = {
                        id: this.prefix + id,
                        title: field.title || id,
                        sortable: 'sortable' in field && field.sortable,
                        order: (id == this.grid.sortColumn) ? this.grid.sortOrder || 'asc' : '',
                        sub: {depth: 0, headers: []}
                    };
                    switch (field.type) {
                        case 'NestedModel':
                        case 'List':
                            header.sub = this.grid._getSubHeaders(field.model.schema, this.prefix + id + '.');
                            break;
                        case 'MultiSchema':
                            var selected = this.grid.collection.first().get(field.selector);
                            var schemas = _.result(field, 'schemas');
                            header.sub = this.grid._getSubHeaders(schemas[selected.id], this.prefix + id + '.');
                            break;
                    }
                    if (header.sub.depth > this.subDepth) {this.subDepth = header.sub.depth;}
                    return header;
                }, context)
            };
            sub.depth = context.subDepth + 1;
            return sub;
        },

        getHeaderIterator: function() {
            return _.bind(
                /*
                 * Breadth-first tree traversal algorithm
                 * adapted to insert a step between each row
                 */
                function (cbBeforeRow, cbCell, cbAfterRow) {
                    var queue = [],
                        cell, row;
                    // initialize queue with a copy of headers
                    _.each(this.headers, function(h) {queue.push(h);});
                    // Iterate over row queue
                    while (queue.length > 0) {
                        row = queue, queue = [];
                        cbBeforeRow(this.depth);
                        while (cell = row.shift()) {
                            // Enqueue sub-headers if any
                            _.each(cell.sub.headers, function(h) {queue.push(h);});
                            // Process the header cell
                            cbCell(cell, this.depth);
                        }
                        cbAfterRow(this.depth);
                        this.depth--;
                    }
                },
                // Bind the tree traversal algorithm to the actual header tree
                this._getSubHeaders(this.collection.model.schema, '')
            );
        },

        serialize: function() {
            var c = this.collection;
            var pageSize;

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
            if (c.limit && _.contains(this.pageSizes, c.limit)) {
                pageSize = c.limit;
            } else {
                throw new Error('Grid page size is invalid or unknown.');
            }

            if (c.totalCount) { pagerData.lastPage = Math.ceil(c.totalCount / pageSize);}
            var startIndexPage = Math.floor(c.skip / pageSize);
            var endIndexPage = Math.floor((c.skip + c.localCount - 1) / pageSize);
            if (startIndexPage == endIndexPage) {
                pagerData.currentPage = startIndexPage + 1;
            } else {
                pagerData.currentPage = null;
            }

            // Keep current page in memory, we'll need it later
            this.currentPage = pagerData.currentPage;
            this.pageSize = pageSize;

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
                buildUrl: $.proxy(function(page) {return this.buildUrl({page: page});}, this),
                id: 'grid-' + this.collection.id,
                pageSizes: this.pageSizes,
                pageSize: pageSize,
                filterOptions: this.filterOptions,
                currentFilter: this.currentFilter,
                headerIterator: this.getHeaderIterator(),
                pager: pagerData
            };
        },

        beforeRender: function() {
            this.collection.each(function(item) {
                this.insertView('tbody', new GridRow({model: item}));
            }, this);
        },

        onPageRedim: function(e) {
            eCollection.router.navigate(this.buildUrl({pageSize: $(e.target).val()}), {trigger: true});
        },
        
        onFilter: function(e) {
            eCollection.router.navigate(this.buildUrl({filter: $(e.target).val()}), {trigger: true});
        },

        onSort: function(e) {
            var $elt = $(e.target);
            var col = $elt.data('id');
            var currentOrder = $elt.data('order');
            if (typeof(currentOrder) === 'undefined') { // Not sorted yet, switch to ascending order
                eCollection.router.navigate(this.buildUrl({sortColumn: col, sortOrder: 'asc'}), {trigger: true});
            } else if (currentOrder == 'asc') { // Already sorted (asc), switch to descending order
                eCollection.router.navigate(this.buildUrl({sortColumn: col, sortOrder: 'desc'}), {trigger: true});
            } else { // Already sorted (desc), swtich back to unsorted
                this.sortColumn = undefined;
                this.sortOrder = undefined;
                eCollection.router.navigate(this.buildUrl(), {trigger: true});
            }
        }
    });

    return ns;
})(NS.UI || {});