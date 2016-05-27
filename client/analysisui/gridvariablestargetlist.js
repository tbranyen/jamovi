'use strict';

var $ = require('jquery');
var _ = require('underscore');
var SelectableLayoutGrid = require('./selectablelayoutgrid');
var GridOptionControl = require('./gridoptioncontrol');
var FormatDef = require('./formatdef');

var GridVariablesTargetList = function(option, params) {
    GridOptionControl.extend(this, option, params);

    this.maxItemCount = _.isUndefined(params.maxItemCount) ? -1 : params.maxItemCount;
    this.isSingleItem = this.maxItemCount === 1;
    this.showHeaders = _.isUndefined(params.showColumnHeaders) ? false : params.showColumnHeaders;
    this.gainOnClick = true;
    this._supplier = null;
    this._actionsBlocked = false;

    this.targetGrid = new SelectableLayoutGrid();
    this.targetGrid.$el.addClass("silky-layout-grid silky-variable-target");
    this.targetGrid.$el.on('dblclick', null, this, function(event) {
        var self = event.data;
        self.onAddButtonClick();
    });
    this.targetGrid.stretchEndCells = false;

    this._localData = [];

    this.setSupplier = function(supplier) {
        this._supplier = supplier;
        var self = this;
        this._supplier.supplierGrid.on('layoutgrid.gotFocus', function() {
            self.gainOnClick = true;
            self.targetGrid.clearSelection();
            self.unblockActionButtons();
        });
        this._supplier.supplierGrid.$el.on('dblclick', function() {
            if (self._supplier.isMultiTarget() === false)
                self.onAddButtonClick();
        });
    };


    this.blockActionButtons = function() {
        this.$button.prop('disabled', true);
        this.targetGrid.clearSelection();
        this._actionsBlocked = true;
    };

    this.unblockActionButtons = function() {
        this.$button.prop('disabled', false);
        this._actionsBlocked = false;
    };

    this.renderTransferButton = function(grid, row, column) {

        this.$button = $('<button type="button" class="silky-option-variable-button"><span class="mif-arrow-right"></span></button>');
        var self = this;
        this.$button.click(function(event) {
            if (self._actionsBlocked === false)
                self.onAddButtonClick();
        });

        grid.addCell(column, row, true, this.$button);

        return { height: 1, width: 1 };
    };

    this.onRender = function(grid, row, column) {

        var self = this;
        var id = this.option.getName();
        var label = this.getParam('label');
        if (label === null)
            label = this.getParam('name');
        var hasSupplier = this._supplier !== null;

        grid.addCell(hasSupplier ? column + 1 : column, row, true, $('<div style="white-space: nowrap;" class="silky-options-h3">' + label + '</div>'));

        if (hasSupplier === true)
            this.renderTransferButton(grid, row + 1, column);

        this.targetGrid._animateCells = true;
        this.targetGrid.allocateSpaceForScrollbars = false;
        //this.targetGrid.$el.css("overflow", "auto");

        if (this.isSingleItem)
            this.targetGrid.$el.addClass('single-item');
        else
            this.targetGrid.$el.addClass('multi-item');
        this.targetGrid.setAutoSizeHeight(false);

        this.targetGrid.on('layoutgrid.lostFocus layoutgrid.gotFocus', function() {
            self.onSelectionChanged();
        });
        var cell = grid.addLayout("target", column + 1, row + 1, false, this.targetGrid);
        cell.horizontalStretchFactor = 0.5;
        cell.dockContentWidth = true;
        cell.dockContentHeight = true;

        var columns = this.params.columns;
        this._columnInfo = {_list:[]};

        if (Array.isArray(columns)) {
            for (var i = 0; i < columns.length; i++) {

                var columnInfo = { readOnly: true, formatName: null, stretchFactor: 1, label: columns[i].name };

                _.extend(columnInfo, columns[i]);

                columnInfo.index = i;

                var name = columnInfo.name;

                if (_.isUndefined(name))
                    throw 'columns must have a name property.';

                if (_.isUndefined(this._columnInfo[name]) === false)
                    throw "Column names must be unique. The column '" + name + "' has been duplicated.";

                this._columnInfo[name] = columnInfo;
                this._columnInfo._list.push(columnInfo);

                if (this.showHeaders) {
                    var hCell = this.targetGrid.addCell(i, 0, false,  $('<div style="white-space: nowrap;" class="silky-listview-header">' + columnInfo.label + '</div>'));
                    hCell.horizontalStretchFactor = columnInfo.stretchFactor;//this.cellStrechFactor;
                    hCell.hAlign = 'centre';
                }
            }
        }

        return { height: 2, width: 2 };
    };

    this.onSelectionChanged = function() {
        var gainOnClick = this.targetGrid.hasFocus === false;
        this.gainOnClick = gainOnClick;
        var $span = this.$button.find('span');
        $span.addClass(gainOnClick ? 'mif-arrow-right' : 'mif-arrow-left');
        $span.removeClass(gainOnClick ? 'mif-arrow-left' : 'mif-arrow-right');
    };

    this.updateValueCell = function(columnInfo, dispRow, value) {
        var dispColumn = columnInfo.index;
        var cell = this.targetGrid.getCell(dispColumn, dispRow);

        if (columnInfo.formatName === null)
            columnInfo.formatName = FormatDef.infer(value).name;

        var displayValue = '';
        var supplierItem = null;
        var localItem = null;
        if (value !== null && columnInfo.formatName !== null) {
            displayValue = 'error';
            var columnFormat = FormatDef[columnInfo.formatName];
            if (columnFormat.isValid(value)) {
                displayValue = columnFormat.toString(value);
                localItem = new FormatDef.constructor(value, columnFormat);
                if (this._supplier !== null)
                    supplierItem = this._supplier.pullItem(localItem);
            }
        }

        var $contents = null;
        var renderFunction = this['renderItem_' + columnInfo.formatName];
        if (localItem !== null && _.isUndefined(renderFunction) === false)
            $contents = renderFunction.call(this, displayValue, columnInfo.readOnly, localItem, supplierItem);
        else
            $contents = $('<div style="white-space: nowrap;" class="silky-list-item silky-format-' + columnInfo.formatName + '">' + displayValue + '</div>');

        if (cell === null) {
            cell = this.targetGrid.addCell(dispColumn, dispRow, false, $contents);
            cell.clickable(columnInfo.readOnly);
        }
        else {
            cell.setContent($contents);
            cell.render();
        }

        cell.horizontalStretchFactor = columnInfo.stretchFactor;
        cell.hAlign = 'left';
        cell.vAlign = 'centre';
    };

    this.renderItem_variable = function(displayValue, readOnly, localItem, supplierItem) {
        var imageClasses = 'silky-variable-type-img';
        if (supplierItem !== null && _.isUndefined(supplierItem.properties.type) === false)
            imageClasses = imageClasses + ' silky-variable-type-' + supplierItem.properties.type;

        var $item = $('<div style="white-space: nowrap;" class="silky-list-item silky-format-variable"></div>');
        $item.append('<div style="display: inline-block; overflow: hidden;" class="' + imageClasses + '"></div>');
        $item.append('<div style="white-space: nowrap;  display: inline-block;" class="silky-list-item-value">' + displayValue + '</div>');

        return $item;
    };

    this.updateDisplayRow = function(dispRow, value) {
         var columnInfo = null;

         if (typeof value !== 'object') {
             columnInfo = this._columnInfo._list[0];
             if (_.isUndefined(columnInfo) === false)
                 this.updateValueCell(columnInfo, dispRow, value);
         }
        else {
            var self = this;
            _.each(value, function(value, key, list) {
                columnInfo = self._columnInfo[key];
                if (_.isUndefined(columnInfo) === false)
                    self.updateValueCell(columnInfo, dispRow, value);
            });
        }
    };

    this.validateOption = function() {
        var list = this.option.getValue();
        if (_.isUndefined(list) || list === null)
            this.state = 'Uninitialised';
        else
            this.state = 'OK';
    };

    this.onAddButtonClick = function() {
        var hasMaxItemCount = this.maxItemCount >= 0;
        var postProcessSelectionIndex = 0;
        if (this.gainOnClick) {
            var selectedCount = this._supplier.supplierGrid.selectedCellCount();
            if (selectedCount > 0) {
                this.targetGrid.suspendLayout();
                this.option.beginEdit();
                for (var i = 0; i < selectedCount; i++) {
                    var currentCount = this.option.getLength();
                    var selectedItem = this._supplier.getSelectedItem(i);
                    if (selectedCount === 1)
                        postProcessSelectionIndex = selectedItem.index;
                    var selectedValue = selectedItem.value;
                    var key = [this.option.getLength()];
                    var data = selectedValue.raw;
                    if (typeof data !== 'object') {
                        var lastRow = this.option.getLength() - 1;
                        var emptyProperty = null;
                        if (lastRow >= 0) {
                            var value = this.option.getValue(lastRow);
                            emptyProperty = _.isUndefined(value) ? null : this.findEmptyProperty(value, selectedValue.format.name);
                        }
                        if (emptyProperty === null) {
                            if (this.isSingleItem === false && hasMaxItemCount && currentCount >= this.maxItemCount)
                                break;
                            var newItem = this.createEmptyItem();
                            if (newItem !== null) {
                                emptyProperty = this.findEmptyProperty(newItem, selectedValue.format.name, data);
                                data = newItem;
                            }
                        }
                        else
                            key = [lastRow, emptyProperty];
                    }
                    else if (hasMaxItemCount && currentCount >= this.maxItemCount)
                        break;

                    if (this.option.valueInited() === false || this.isSingleItem)
                        this.option.setValue(this.isSingleItem ? data : [data]);
                    else
                        this.option.insertValueAt( data, key );
                }
                this.option.endEdit();
                this._supplier.selectNextAvaliableItem(postProcessSelectionIndex);
                this.targetGrid.resumeLayout();
            }
        }
        else if (this.targetGrid.selectedCellCount() > 0) {
            var startRow = -1;
            var length = 0;
            this.targetGrid.suspendLayout();
            this.option.beginEdit();
            var selectionCount = this.targetGrid.selectedCellCount();
            while (this.targetGrid.selectedCellCount() > 0) {
                var cell = this.targetGrid.getSelectedCell(0);
                if (selectionCount === 1)
                    postProcessSelectionIndex = this.displayRowToRowIndex(cell.data.row);

                if (this.isSingleItem)
                    this.option.setValue(null);
                else
                    this.option.removeAt([this.displayRowToRowIndex(cell.data.row)]);
            }
            this._supplier.filterSuppliersList();
            this.option.endEdit();
            this.selectNextAvaliableItem(postProcessSelectionIndex);
            this.targetGrid.resumeLayout();
        }
    };

    this.selectNextAvaliableItem = function(from) {
        var cell = this.targetGrid.getCell(0, this.rowIndexToDisplayIndex(from >= this._localData.length ? this._localData.length - 1 : from));
        this.targetGrid.selectCell(cell);
    };

    this.rowIndexToDisplayIndex = function(rowIndex) {
        return rowIndex + (this.showHeaders ? 1 : 0);
    };

    this.displayRowToRowIndex = function(dispRow) {
        return dispRow - (this.showHeaders ? 1 : 0);
    };

    this.pushRowsBackToSupplier = function(rowIndex, count) {
        count = _.isUndefined(count) ? 1 : count;
        for (var row = rowIndex; row < rowIndex + count; row++) {
            var rowCells = this.targetGrid.getRow(this.rowIndexToDisplayIndex(row));
            for (var c = 0; c < rowCells.length; c++) {
                var rowCell = rowCells[c];
                var columnInfo = this._columnInfo._list[rowCell.data.column];
                var cellInfo = this.getCellInfo(rowCell);
                var formattedValue = new FormatDef.constructor(cellInfo.value, cellInfo.format);
                this._supplier.pushItem(formattedValue);
            }
        }
    };

    this.getCellInfo = function(cell) {
        var info = { };

        var rowIndex = this.displayRowToRowIndex(cell.data.row);

        info.cell = cell;
        info.columnInfo = this._columnInfo._list[cell.data.column];

        info.value = this._localData[rowIndex];
        if (typeof info.value === 'object')
            info.value = info.value[info.columnInfo.name];

        if (info.columnInfo.formatName === null) {
            info.format = FormatDef.infer(info.value);
            info.columnInfo.formatName = info.format.name;
        }
        else
            info.format = FormatDef[info.columnInfo.formatName];

        return info;
    };

    this.findEmptyProperty = function(item, formatName, value) {

        var columns = this._columnInfo._list;

        for (var i = 0; i < columns.length; i++) {

            var name = columns[i].name;

            if (columns[i].formatName === formatName && item[name] === null) {
                if (_.isUndefined(value) === false)
                    item[name] = value;
                return name;
            }
        }

        return null;
    };

    this.createEmptyItem = function() {
        var itemPrototype = {};
        var columns = this._columnInfo._list;

        if (columns.length === 1)
            return null;

        for (var i = 0; i < columns.length; i++) {
            var name = columns[i].name;
            itemPrototype[name] = null;
        }

        return itemPrototype;
    };


    //outside -> in
    this.onOptionValueInserted = function(keys, data) {

        var dispRow = this.rowIndexToDisplayIndex(keys[0]);
        this.targetGrid.insertRow(dispRow, 1);
        var item = this.option.getValue(keys);
        this._localData.splice(keys[0], 0, item);
        this.updateDisplayRow(dispRow, item);
        this.targetGrid.render();

        if (this._supplier !== null)
            this._supplier.filterSuppliersList();
    };

    this.onOptionValueRemoved = function(keys, data) {

        var dispRow = this.rowIndexToDisplayIndex(keys[0]);
        if (this._supplier !== null)
            this.pushRowsBackToSupplier(keys[0], 1);
        this.targetGrid.removeRow(dispRow);

        this._localData.splice(keys[0], 1);

        if (this._supplier !== null)
            this._supplier.filterSuppliersList();
    };

    this.onOptionValueChanged = function(keys, data) {
        this.targetGrid.suspendLayout();
        if (this._supplier !== null)
            this.pushRowsBackToSupplier(0, this._localData.length);
        this._localData = [];

        var list = this.option.getValue();
        if (list !== null) {
            if (Array.isArray(list)) {
                for (var i = 0; i < list.length; i++) {
                    this.updateDisplayRow(this.rowIndexToDisplayIndex(i), list[i]);
                    this._localData.push(list[i]);
                }
                var countToRemove = this.displayRowToRowIndex(this.targetGrid._rowCount) - this._localData.length;
                this.targetGrid.removeRow(this.rowIndexToDisplayIndex(this._localData.length), countToRemove);
            }
            else if (this.isSingleItem) {
                this._localData[0] = list;
                this.updateDisplayRow(this.rowIndexToDisplayIndex(0), list);
            }
        }
        else
            this.targetGrid.removeRow(this.rowIndexToDisplayIndex(0), this.targetGrid._rowCount);

        this.targetGrid.render();
        this.targetGrid.resumeLayout();
        if (this._supplier !== null)
            this._supplier.filterSuppliersList();
    };
};

module.exports = GridVariablesTargetList;
