/*
 * Grid view
 */

var NS = window.NS || {};

NS.UI = (function(ns) {
    "use strict";

    var GridRow = eCollection.utilities.BaseView.extend({
        template: 'gridrow',

        events: {
            'click': 'onClick'
        },

        initialize: function() {
            eCollection.utilities.BaseView.prototype.initialize.apply(this, arguments);
            this.actions = _.extend({}, this.model.getLocalURLs());
            this.listenTo(this.model, 'change', this.render);
        },

        serialize: function() {
            var viewData = {};
            viewData.attr = this.model.getFlatAttrs();
            viewData.actions = this.actions;
            return viewData;
        },

        onClick: function(e) {
            if (!('href' in e.target)) { // Do not simulate anchor if an anchor is clicked
                e.preventDefault();
                eCollection.router.navigate(this.actions.view, {trigger: true});
            }
        }
    });

    ns.Grid = eCollection.utilities.BaseView.extend({
        template: 'grid',

        events: {
            'click .sort-action': 'onSort',
            'click .filter-action': 'toggleFilter',
            'submit .filter-form form': 'addFilter',
            'input .filter-form input[type="number"]': 'onNumberInput',
            'reset .filter-form form': 'clearFilter',
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
            this.filters = {};
            if (_.isArray(options.filters)) {
                var key, val;
                for (var i=0; i<options.filters.length; i++) {
                    // /!\ beware of .split(':', 2), it will forget every char after a second ':' if any
                    key = options.filters[i].split(':', 1)[0]; // Safe, .split() will return [""] at least
                    val = options.filters[i].slice(key.length + 1); // Safe, s.slice(n) accepts n > s.length and return ""
                    this.filters[key] = val;
                }
            }
            this._numberRegexp = new RegExp('^([0-9]+|[0-9]*[\.,][0-9]+)$');
        },

        buildUrl: function(params) {
            params = params || {};
            var options = {
                page: params.page || this.currentPage,
                pageSize: params.pageSize || this.pageSize
            };
            var sortColumn = params.sortColumn || this.sortColumn;
            var sortOrder = params.sortOrder || this.sortOrder || 'asc';
            if (typeof(sortColumn) !== 'undefined') {
                options.sortColumn = sortColumn;
                options.sortOrder = sortOrder;
            }
            var currentFilter = ('filter' in params) ? params.filter : this.currentFilter;
            if (currentFilter != '') options.filter = currentFilter;
            options.filters = [];
            _.each(this.filters, function(v, k) {options.filters.push(k + ':' + v);});
            return this.baseUrl + '?' + $.param(options);
        },

        _getSubHeaders: function(schema, prefix) {
            var context = {
                grid: this,
                prefix: prefix,
                subDepth: 0
            }, sub = {
                headers: []
            };

            _.each(schema, function(field, id) {
                if (('main' in field) && !field.main) return ;
                var header = {
                    id: this.prefix + id,
                    title: field.title || id,
                    sortable: 'sortable' in field && field.sortable,
                    order: (this.prefix + id == this.grid.sortColumn) ? this.grid.sortOrder || 'asc' : '',
                    sub: {depth: 0, headers: []}
                };
                switch (field.type) {
                    case 'NestedModel':
                    case 'List':
                        header.sub = this.grid._getSubHeaders(field.model.schema, this.prefix + id + '.');
                        break;
                    case 'MultiSchema':
                        var schemas = _.result(field, 'schemas');
                        var selected = this.grid.currentFilter;
                        if (selected === '' && this.grid.filterOptions.length > 0) {
                            selected = this.grid.filterOptions[0].id;
                        }
                        if (selected !== '') {
                            header.sub = this.grid._getSubHeaders(schemas[selected], this.prefix + id + '.');
                        }
                        break;
                    case 'Text':
                    case 'Boolean':
                    case 'Number':
                        header.filter = {type: field.type, val: this.grid.filters[this.prefix + id]};
                        break;
                    case 'Date':
                        var d = new Date(this.grid.filters[this.prefix + id]),
                            val = (isFinite(d)) ? d.getDate() + '/' + (d.getMonth()+1)  + '/' + d.getFullYear() : undefined;
                        header.filter = {type: field.type, val: val};
                        break;
                }
                if (header.sub.depth > this.subDepth) {this.subDepth = header.sub.depth;}
                sub.headers.push(header);
            }, context);

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
                totalCount: c.totalCount,
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
                verboseName: 'List of ' + this.collection.model.verboseName.toLowerCase(),
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

        afterRender: function() {
            // Allow user to define a datepicker widget
            this.$el.find('th input[type="date"]').each($.proxy(function(idx, elt) {
                this.addDatePicker(elt);
            }, this));
        },

        addDatePicker: function(element) {
            // Can be overridden by users to activate a custom datepicker on date inputs
            // TODO: move this code to eCollection when refactoring
            var $el = $(element),
                val = $el.val();
            $el.attr('type', 'text');
            $el.datepicker({format: 'dd/mm/yyyy'})
                .on('changeDate', $el, function(e) {
                    if (e.viewMode == 'days') {
                        e.data.trigger('input');
                    }
                });
            $el.on('input', function(e) {$(this).datepicker('hide');});
            $el.on('blur', function(e) {$(this).datepicker('hide');});
            if (val) $el.datepicker('setValue', val);
        },

        onPageRedim: function(e) {
            eCollection.router.navigate(this.buildUrl({pageSize: $(e.target).val()}), {trigger: true});
        },

        onNumberInput: function(e) {
            var $input = $(e.target),
                val = $input.val();
            $input.toggleClass('error', val != '' && !this._numberRegexp.test(val));
        },

        onFilter: function(e) {
            eCollection.router.navigate(this.buildUrl({filter: $(e.target).val()}), {trigger: true});
        },

        clearFilter: function(e) {
            var $form = $(e.target),
                key = $form.data('id');
            delete this.filters[key];
            $form.find('.error').removeClass('error');
            eCollection.router.navigate(this.buildUrl(), {trigger: true});
            $form.parents('.filter-form').hide();
        },

        addFilter: function(e) {
            e.preventDefault();
            var $form = $(e.target),
                key = $form.data('id');
            switch ($form.data('type')) {
                case 'Text':
                    var val = $form.find('[name="val"]').val();
                    val = $.trim(val);
                    break;
                case 'Number':
                    var val = $form.find('[name="val"]').val();
                    val = $.trim(val);
                    if (this._numberRegexp.test(val))
                        val = val.replace(/,/, '.');
                    else
                        val = '';
                    break;
                case 'Date':
                    var val = $.trim($form.find('[name="val"]').val()),
                        parts;
                    if (! /\d{2}\/\d{2}\/\d{4}/.test(val)) {
                        val = '';
                        break;
                    }
                    // Beware of new Date(s), if s is 01/10/2012, it is interpreted as Jan 10, 2012
                    parts = val.split('/')
                    val = new Date(parts[2], parts[1]-1, parts[0]);
                    if (isFinite(val)) {
                        // Remove TZ offset
                        // FIXME: it should be possible to handle TZ in a clever way, I have to investigate...
                        // Note that the problem comes from the server data which pretend to be UTC but is not
                        val.setMinutes(val.getMinutes() - val.getTimezoneOffset());
                        val = val.toISOString();
                    } else {
                        val = '';
                    }
                    break;
                case 'Boolean':
                    var val = $form.find('[name="val"]:checked').val() || '';
                    break;
            }
            if (val == '')
                delete this.filters[key];
            else
                this.filters[key] = val;
            eCollection.router.navigate(this.buildUrl(), {trigger: true});
            $form.parents('.filter-form').hide();
        },

        toggleFilter: function(e) {
            var form = $(e.target).siblings('.filter-form'),
                isHidden = form.is(':hidden');
            $('.grid .filter-form').hide(); // Close all open forms (on this column or on other columns)
            if (isHidden) {
                form.show();
                form.find('input').first().focus();
            }
        },

        onSort: function(e) {
            var $elt = $(e.target);
            var col = $elt.data('id');
            var currentOrder = $elt.data('order');
            if (currentOrder == 'asc') { // Already sorted (asc), switch to descending order
                eCollection.router.navigate(this.buildUrl({sortColumn: col, sortOrder: 'desc'}), {trigger: true});
            } else if (currentOrder == 'desc') { // Already sorted (desc), swtich back to unsorted
                this.sortColumn = undefined; // FIXME: this should be a no-op! refactoring needed
                this.sortOrder = undefined;
                eCollection.router.navigate(this.buildUrl(), {trigger: true});
            } else { // Not sorted yet, switch to ascending order
                eCollection.router.navigate(this.buildUrl({sortColumn: col, sortOrder: 'asc'}), {trigger: true});
            }
        }
    });

    return ns;
})(NS.UI || {});