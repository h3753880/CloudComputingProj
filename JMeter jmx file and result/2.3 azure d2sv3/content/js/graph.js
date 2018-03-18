/*
   Licensed to the Apache Software Foundation (ASF) under one or more
   contributor license agreements.  See the NOTICE file distributed with
   this work for additional information regarding copyright ownership.
   The ASF licenses this file to You under the Apache License, Version 2.0
   (the "License"); you may not use this file except in compliance with
   the License.  You may obtain a copy of the License at

       http://www.apache.org/licenses/LICENSE-2.0

   Unless required by applicable law or agreed to in writing, software
   distributed under the License is distributed on an "AS IS" BASIS,
   WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   See the License for the specific language governing permissions and
   limitations under the License.
*/
$(document).ready(function() {

    $(".click-title").mouseenter( function(    e){
        e.preventDefault();
        this.style.cursor="pointer";
    });
    $(".click-title").mousedown( function(event){
        event.preventDefault();
    });

    // Ugly code while this script is shared among several pages
    try{
        refreshHitsPerSecond(true);
    } catch(e){}
    try{
        refreshResponseTimeOverTime(true);
    } catch(e){}
    try{
        refreshResponseTimePercentiles();
    } catch(e){}
    $(".portlet-header").css("cursor", "auto");
});

var showControllersOnly = false;
var seriesFilter = "";
var filtersOnlySampleSeries = true;

// Fixes time stamps
function fixTimeStamps(series, offset){
    $.each(series, function(index, item) {
        $.each(item.data, function(index, coord) {
            coord[0] += offset;
        });
    });
}

// Check if the specified jquery object is a graph
function isGraph(object){
    return object.data('plot') !== undefined;
}

/**
 * Export graph to a PNG
 */
function exportToPNG(graphName, target) {
    var plot = $("#"+graphName).data('plot');
    var flotCanvas = plot.getCanvas();
    var image = flotCanvas.toDataURL();
    image = image.replace("image/png", "image/octet-stream");
    
    var downloadAttrSupported = ("download" in document.createElement("a"));
    if(downloadAttrSupported === true) {
        target.download = graphName + ".png";
        target.href = image;
    }
    else {
        document.location.href = image;
    }
    
}

// Override the specified graph options to fit the requirements of an overview
function prepareOverviewOptions(graphOptions){
    var overviewOptions = {
        series: {
            shadowSize: 0,
            lines: {
                lineWidth: 1
            },
            points: {
                // Show points on overview only when linked graph does not show
                // lines
                show: getProperty('series.lines.show', graphOptions) == false,
                radius : 1
            }
        },
        xaxis: {
            ticks: 2,
            axisLabel: null
        },
        yaxis: {
            ticks: 2,
            axisLabel: null
        },
        legend: {
            show: false,
            container: null
        },
        grid: {
            hoverable: false
        },
        tooltip: false
    };
    return $.extend(true, {}, graphOptions, overviewOptions);
}

// Force axes boundaries using graph extra options
function prepareOptions(options, data) {
    options.canvas = true;
    var extraOptions = data.extraOptions;
    if(extraOptions !== undefined){
        var xOffset = options.xaxis.mode === "time" ? -25200000 : 0;
        var yOffset = options.yaxis.mode === "time" ? -25200000 : 0;

        if(!isNaN(extraOptions.minX))
        	options.xaxis.min = parseFloat(extraOptions.minX) + xOffset;
        
        if(!isNaN(extraOptions.maxX))
        	options.xaxis.max = parseFloat(extraOptions.maxX) + xOffset;
        
        if(!isNaN(extraOptions.minY))
        	options.yaxis.min = parseFloat(extraOptions.minY) + yOffset;
        
        if(!isNaN(extraOptions.maxY))
        	options.yaxis.max = parseFloat(extraOptions.maxY) + yOffset;
    }
}

// Filter, mark series and sort data
/**
 * @param data
 * @param noMatchColor if defined and true, series.color are not matched with index
 */
function prepareSeries(data, noMatchColor){
    var result = data.result;

    // Keep only series when needed
    if(seriesFilter && (!filtersOnlySampleSeries || result.supportsControllersDiscrimination)){
        // Insensitive case matching
        var regexp = new RegExp(seriesFilter, 'i');
        result.series = $.grep(result.series, function(series, index){
            return regexp.test(series.label);
        });
    }

    // Keep only controllers series when supported and needed
    if(result.supportsControllersDiscrimination && showControllersOnly){
        result.series = $.grep(result.series, function(series, index){
            return series.isController;
        });
    }

    // Sort data and mark series
    $.each(result.series, function(index, series) {
        series.data.sort(compareByXCoordinate);
        if(!(noMatchColor && noMatchColor===true)) {
	        series.color = index;
	    }
    });
}

// Set the zoom on the specified plot object
function zoomPlot(plot, xmin, xmax, ymin, ymax){
    var axes = plot.getAxes();
    // Override axes min and max options
    $.extend(true, axes, {
        xaxis: {
            options : { min: xmin, max: xmax }
        },
        yaxis: {
            options : { min: ymin, max: ymax }
        }
    });

    // Redraw the plot
    plot.setupGrid();
    plot.draw();
}

// Prepares DOM items to add zoom function on the specified graph
function setGraphZoomable(graphSelector, overviewSelector){
    var graph = $(graphSelector);
    var overview = $(overviewSelector);

    // Ignore mouse down event
    graph.bind("mousedown", function() { return false; });
    overview.bind("mousedown", function() { return false; });

    // Zoom on selection
    graph.bind("plotselected", function (event, ranges) {
        // clamp the zooming to prevent infinite zoom
        if (ranges.xaxis.to - ranges.xaxis.from < 0.00001) {
            ranges.xaxis.to = ranges.xaxis.from + 0.00001;
        }
        if (ranges.yaxis.to - ranges.yaxis.from < 0.00001) {
            ranges.yaxis.to = ranges.yaxis.from + 0.00001;
        }

        // Do the zooming
        var plot = graph.data('plot');
        zoomPlot(plot, ranges.xaxis.from, ranges.xaxis.to, ranges.yaxis.from, ranges.yaxis.to);
        plot.clearSelection();

        // Synchronize overview selection
        overview.data('plot').setSelection(ranges, true);
    });

    // Zoom linked graph on overview selection
    overview.bind("plotselected", function (event, ranges) {
        graph.data('plot').setSelection(ranges);
    });

    // Reset linked graph zoom when reseting overview selection
    overview.bind("plotunselected", function () {
        var overviewAxes = overview.data('plot').getAxes();
        zoomPlot(graph.data('plot'), overviewAxes.xaxis.min, overviewAxes.xaxis.max, overviewAxes.yaxis.min, overviewAxes.yaxis.max);
    });
}

var responseTimePercentilesInfos = {
        data: {"result": {"minY": 302378.0, "minX": 0.0, "maxY": 334098.0, "series": [{"data": [[0.0, 302378.0], [0.1, 302378.0], [0.2, 302378.0], [0.3, 302378.0], [0.4, 302378.0], [0.5, 302378.0], [0.6, 302378.0], [0.7, 302378.0], [0.8, 302378.0], [0.9, 303233.0], [1.0, 303233.0], [1.1, 303233.0], [1.2, 303233.0], [1.3, 303233.0], [1.4, 303233.0], [1.5, 303233.0], [1.6, 303233.0], [1.7, 304914.0], [1.8, 304914.0], [1.9, 304914.0], [2.0, 304914.0], [2.1, 304914.0], [2.2, 304914.0], [2.3, 304914.0], [2.4, 304914.0], [2.5, 307670.0], [2.6, 307670.0], [2.7, 307670.0], [2.8, 307670.0], [2.9, 307670.0], [3.0, 307670.0], [3.1, 307670.0], [3.2, 307670.0], [3.3, 307670.0], [3.4, 308376.0], [3.5, 308376.0], [3.6, 308376.0], [3.7, 308376.0], [3.8, 308376.0], [3.9, 308376.0], [4.0, 308376.0], [4.1, 308376.0], [4.2, 309184.0], [4.3, 309184.0], [4.4, 309184.0], [4.5, 309184.0], [4.6, 309184.0], [4.7, 309184.0], [4.8, 309184.0], [4.9, 309184.0], [5.0, 311131.0], [5.1, 311131.0], [5.2, 311131.0], [5.3, 311131.0], [5.4, 311131.0], [5.5, 311131.0], [5.6, 311131.0], [5.7, 311131.0], [5.8, 311131.0], [5.9, 312508.0], [6.0, 312508.0], [6.1, 312508.0], [6.2, 312508.0], [6.3, 312508.0], [6.4, 312508.0], [6.5, 312508.0], [6.6, 312508.0], [6.7, 313692.0], [6.8, 313692.0], [6.9, 313692.0], [7.0, 313692.0], [7.1, 313692.0], [7.2, 313692.0], [7.3, 313692.0], [7.4, 313692.0], [7.5, 315226.0], [7.6, 315226.0], [7.7, 315226.0], [7.8, 315226.0], [7.9, 315226.0], [8.0, 315226.0], [8.1, 315226.0], [8.2, 315226.0], [8.3, 315226.0], [8.4, 315724.0], [8.5, 315724.0], [8.6, 315724.0], [8.7, 315724.0], [8.8, 315724.0], [8.9, 315724.0], [9.0, 315724.0], [9.1, 315724.0], [9.2, 316039.0], [9.3, 316039.0], [9.4, 316039.0], [9.5, 316039.0], [9.6, 316039.0], [9.7, 316039.0], [9.8, 316039.0], [9.9, 316039.0], [10.0, 316343.0], [10.1, 316343.0], [10.2, 316343.0], [10.3, 316343.0], [10.4, 316343.0], [10.5, 316343.0], [10.6, 316343.0], [10.7, 316343.0], [10.8, 316343.0], [10.9, 316805.0], [11.0, 316805.0], [11.1, 316805.0], [11.2, 316805.0], [11.3, 316805.0], [11.4, 316805.0], [11.5, 316805.0], [11.6, 316805.0], [11.7, 316929.0], [11.8, 316929.0], [11.9, 316929.0], [12.0, 316929.0], [12.1, 316929.0], [12.2, 316929.0], [12.3, 316929.0], [12.4, 316929.0], [12.5, 316929.0], [12.6, 317141.0], [12.7, 317141.0], [12.8, 317141.0], [12.9, 317141.0], [13.0, 317141.0], [13.1, 317141.0], [13.2, 317141.0], [13.3, 317141.0], [13.4, 317166.0], [13.5, 317166.0], [13.6, 317166.0], [13.7, 317166.0], [13.8, 317166.0], [13.9, 317166.0], [14.0, 317166.0], [14.1, 317166.0], [14.2, 317755.0], [14.3, 317755.0], [14.4, 317755.0], [14.5, 317755.0], [14.6, 317755.0], [14.7, 317755.0], [14.8, 317755.0], [14.9, 317755.0], [15.0, 317755.0], [15.1, 318064.0], [15.2, 318064.0], [15.3, 318064.0], [15.4, 318064.0], [15.5, 318064.0], [15.6, 318064.0], [15.7, 318064.0], [15.8, 318064.0], [15.9, 318136.0], [16.0, 318136.0], [16.1, 318136.0], [16.2, 318136.0], [16.3, 318136.0], [16.4, 318136.0], [16.5, 318136.0], [16.6, 318136.0], [16.7, 318481.0], [16.8, 318481.0], [16.9, 318481.0], [17.0, 318481.0], [17.1, 318481.0], [17.2, 318481.0], [17.3, 318481.0], [17.4, 318481.0], [17.5, 318481.0], [17.6, 318912.0], [17.7, 318912.0], [17.8, 318912.0], [17.9, 318912.0], [18.0, 318912.0], [18.1, 318912.0], [18.2, 318912.0], [18.3, 318912.0], [18.4, 319175.0], [18.5, 319175.0], [18.6, 319175.0], [18.7, 319175.0], [18.8, 319175.0], [18.9, 319175.0], [19.0, 319175.0], [19.1, 319175.0], [19.2, 319442.0], [19.3, 319442.0], [19.4, 319442.0], [19.5, 319442.0], [19.6, 319442.0], [19.7, 319442.0], [19.8, 319442.0], [19.9, 319442.0], [20.0, 319462.0], [20.1, 319462.0], [20.2, 319462.0], [20.3, 319462.0], [20.4, 319462.0], [20.5, 319462.0], [20.6, 319462.0], [20.7, 319462.0], [20.8, 319462.0], [20.9, 319692.0], [21.0, 319692.0], [21.1, 319692.0], [21.2, 319692.0], [21.3, 319692.0], [21.4, 319692.0], [21.5, 319692.0], [21.6, 319692.0], [21.7, 319724.0], [21.8, 319724.0], [21.9, 319724.0], [22.0, 319724.0], [22.1, 319724.0], [22.2, 319724.0], [22.3, 319724.0], [22.4, 319724.0], [22.5, 320138.0], [22.6, 320138.0], [22.7, 320138.0], [22.8, 320138.0], [22.9, 320138.0], [23.0, 320138.0], [23.1, 320138.0], [23.2, 320138.0], [23.3, 320138.0], [23.4, 320151.0], [23.5, 320151.0], [23.6, 320151.0], [23.7, 320151.0], [23.8, 320151.0], [23.9, 320151.0], [24.0, 320151.0], [24.1, 320151.0], [24.2, 320409.0], [24.3, 320409.0], [24.4, 320409.0], [24.5, 320409.0], [24.6, 320409.0], [24.7, 320409.0], [24.8, 320409.0], [24.9, 320409.0], [25.0, 320446.0], [25.1, 320446.0], [25.2, 320446.0], [25.3, 320446.0], [25.4, 320446.0], [25.5, 320446.0], [25.6, 320446.0], [25.7, 320446.0], [25.8, 320446.0], [25.9, 320485.0], [26.0, 320485.0], [26.1, 320485.0], [26.2, 320485.0], [26.3, 320485.0], [26.4, 320485.0], [26.5, 320485.0], [26.6, 320485.0], [26.7, 320541.0], [26.8, 320541.0], [26.9, 320541.0], [27.0, 320541.0], [27.1, 320541.0], [27.2, 320541.0], [27.3, 320541.0], [27.4, 320541.0], [27.5, 320663.0], [27.6, 320663.0], [27.7, 320663.0], [27.8, 320663.0], [27.9, 320663.0], [28.0, 320663.0], [28.1, 320663.0], [28.2, 320663.0], [28.3, 320663.0], [28.4, 320747.0], [28.5, 320747.0], [28.6, 320747.0], [28.7, 320747.0], [28.8, 320747.0], [28.9, 320747.0], [29.0, 320747.0], [29.1, 320747.0], [29.2, 320780.0], [29.3, 320780.0], [29.4, 320780.0], [29.5, 320780.0], [29.6, 320780.0], [29.7, 320780.0], [29.8, 320780.0], [29.9, 320780.0], [30.0, 320808.0], [30.1, 320808.0], [30.2, 320808.0], [30.3, 320808.0], [30.4, 320808.0], [30.5, 320808.0], [30.6, 320808.0], [30.7, 320808.0], [30.8, 320808.0], [30.9, 320978.0], [31.0, 320978.0], [31.1, 320978.0], [31.2, 320978.0], [31.3, 320978.0], [31.4, 320978.0], [31.5, 320978.0], [31.6, 320978.0], [31.7, 321001.0], [31.8, 321001.0], [31.9, 321001.0], [32.0, 321001.0], [32.1, 321001.0], [32.2, 321001.0], [32.3, 321001.0], [32.4, 321001.0], [32.5, 321060.0], [32.6, 321060.0], [32.7, 321060.0], [32.8, 321060.0], [32.9, 321060.0], [33.0, 321060.0], [33.1, 321060.0], [33.2, 321060.0], [33.3, 321060.0], [33.4, 321076.0], [33.5, 321076.0], [33.6, 321076.0], [33.7, 321076.0], [33.8, 321076.0], [33.9, 321076.0], [34.0, 321076.0], [34.1, 321076.0], [34.2, 321118.0], [34.3, 321118.0], [34.4, 321118.0], [34.5, 321118.0], [34.6, 321118.0], [34.7, 321118.0], [34.8, 321118.0], [34.9, 321118.0], [35.0, 321214.0], [35.1, 321214.0], [35.2, 321214.0], [35.3, 321214.0], [35.4, 321214.0], [35.5, 321214.0], [35.6, 321214.0], [35.7, 321214.0], [35.8, 321214.0], [35.9, 321268.0], [36.0, 321268.0], [36.1, 321268.0], [36.2, 321268.0], [36.3, 321268.0], [36.4, 321268.0], [36.5, 321268.0], [36.6, 321268.0], [36.7, 321293.0], [36.8, 321293.0], [36.9, 321293.0], [37.0, 321293.0], [37.1, 321293.0], [37.2, 321293.0], [37.3, 321293.0], [37.4, 321293.0], [37.5, 321357.0], [37.6, 321357.0], [37.7, 321357.0], [37.8, 321357.0], [37.9, 321357.0], [38.0, 321357.0], [38.1, 321357.0], [38.2, 321357.0], [38.3, 321357.0], [38.4, 321403.0], [38.5, 321403.0], [38.6, 321403.0], [38.7, 321403.0], [38.8, 321403.0], [38.9, 321403.0], [39.0, 321403.0], [39.1, 321403.0], [39.2, 321442.0], [39.3, 321442.0], [39.4, 321442.0], [39.5, 321442.0], [39.6, 321442.0], [39.7, 321442.0], [39.8, 321442.0], [39.9, 321442.0], [40.0, 321442.0], [40.1, 321466.0], [40.2, 321466.0], [40.3, 321466.0], [40.4, 321466.0], [40.5, 321466.0], [40.6, 321466.0], [40.7, 321466.0], [40.8, 321466.0], [40.9, 321509.0], [41.0, 321509.0], [41.1, 321509.0], [41.2, 321509.0], [41.3, 321509.0], [41.4, 321509.0], [41.5, 321509.0], [41.6, 321509.0], [41.7, 321526.0], [41.8, 321526.0], [41.9, 321526.0], [42.0, 321526.0], [42.1, 321526.0], [42.2, 321526.0], [42.3, 321526.0], [42.4, 321526.0], [42.5, 321526.0], [42.6, 321537.0], [42.7, 321537.0], [42.8, 321537.0], [42.9, 321537.0], [43.0, 321537.0], [43.1, 321537.0], [43.2, 321537.0], [43.3, 321537.0], [43.4, 321792.0], [43.5, 321792.0], [43.6, 321792.0], [43.7, 321792.0], [43.8, 321792.0], [43.9, 321792.0], [44.0, 321792.0], [44.1, 321792.0], [44.2, 321815.0], [44.3, 321815.0], [44.4, 321815.0], [44.5, 321815.0], [44.6, 321815.0], [44.7, 321815.0], [44.8, 321815.0], [44.9, 321815.0], [45.0, 321815.0], [45.1, 321834.0], [45.2, 321834.0], [45.3, 321834.0], [45.4, 321834.0], [45.5, 321834.0], [45.6, 321834.0], [45.7, 321834.0], [45.8, 321834.0], [45.9, 322038.0], [46.0, 322038.0], [46.1, 322038.0], [46.2, 322038.0], [46.3, 322038.0], [46.4, 322038.0], [46.5, 322038.0], [46.6, 322038.0], [46.7, 322039.0], [46.8, 322039.0], [46.9, 322039.0], [47.0, 322039.0], [47.1, 322039.0], [47.2, 322039.0], [47.3, 322039.0], [47.4, 322039.0], [47.5, 322039.0], [47.6, 322069.0], [47.7, 322069.0], [47.8, 322069.0], [47.9, 322069.0], [48.0, 322069.0], [48.1, 322069.0], [48.2, 322069.0], [48.3, 322069.0], [48.4, 322325.0], [48.5, 322325.0], [48.6, 322325.0], [48.7, 322325.0], [48.8, 322325.0], [48.9, 322325.0], [49.0, 322325.0], [49.1, 322325.0], [49.2, 322394.0], [49.3, 322394.0], [49.4, 322394.0], [49.5, 322394.0], [49.6, 322394.0], [49.7, 322394.0], [49.8, 322394.0], [49.9, 322394.0], [50.0, 322394.0], [50.1, 322430.0], [50.2, 322430.0], [50.3, 322430.0], [50.4, 322430.0], [50.5, 322430.0], [50.6, 322430.0], [50.7, 322430.0], [50.8, 322430.0], [50.9, 322448.0], [51.0, 322448.0], [51.1, 322448.0], [51.2, 322448.0], [51.3, 322448.0], [51.4, 322448.0], [51.5, 322448.0], [51.6, 322448.0], [51.7, 322589.0], [51.8, 322589.0], [51.9, 322589.0], [52.0, 322589.0], [52.1, 322589.0], [52.2, 322589.0], [52.3, 322589.0], [52.4, 322589.0], [52.5, 322589.0], [52.6, 322605.0], [52.7, 322605.0], [52.8, 322605.0], [52.9, 322605.0], [53.0, 322605.0], [53.1, 322605.0], [53.2, 322605.0], [53.3, 322605.0], [53.4, 322607.0], [53.5, 322607.0], [53.6, 322607.0], [53.7, 322607.0], [53.8, 322607.0], [53.9, 322607.0], [54.0, 322607.0], [54.1, 322607.0], [54.2, 322638.0], [54.3, 322638.0], [54.4, 322638.0], [54.5, 322638.0], [54.6, 322638.0], [54.7, 322638.0], [54.8, 322638.0], [54.9, 322638.0], [55.0, 322638.0], [55.1, 322798.0], [55.2, 322798.0], [55.3, 322798.0], [55.4, 322798.0], [55.5, 322798.0], [55.6, 322798.0], [55.7, 322798.0], [55.8, 322798.0], [55.9, 322840.0], [56.0, 322840.0], [56.1, 322840.0], [56.2, 322840.0], [56.3, 322840.0], [56.4, 322840.0], [56.5, 322840.0], [56.6, 322840.0], [56.7, 322925.0], [56.8, 322925.0], [56.9, 322925.0], [57.0, 322925.0], [57.1, 322925.0], [57.2, 322925.0], [57.3, 322925.0], [57.4, 322925.0], [57.5, 322925.0], [57.6, 323022.0], [57.7, 323022.0], [57.8, 323022.0], [57.9, 323022.0], [58.0, 323022.0], [58.1, 323022.0], [58.2, 323022.0], [58.3, 323022.0], [58.4, 323135.0], [58.5, 323135.0], [58.6, 323135.0], [58.7, 323135.0], [58.8, 323135.0], [58.9, 323135.0], [59.0, 323135.0], [59.1, 323135.0], [59.2, 323361.0], [59.3, 323361.0], [59.4, 323361.0], [59.5, 323361.0], [59.6, 323361.0], [59.7, 323361.0], [59.8, 323361.0], [59.9, 323361.0], [60.0, 323361.0], [60.1, 323448.0], [60.2, 323448.0], [60.3, 323448.0], [60.4, 323448.0], [60.5, 323448.0], [60.6, 323448.0], [60.7, 323448.0], [60.8, 323448.0], [60.9, 323458.0], [61.0, 323458.0], [61.1, 323458.0], [61.2, 323458.0], [61.3, 323458.0], [61.4, 323458.0], [61.5, 323458.0], [61.6, 323458.0], [61.7, 323563.0], [61.8, 323563.0], [61.9, 323563.0], [62.0, 323563.0], [62.1, 323563.0], [62.2, 323563.0], [62.3, 323563.0], [62.4, 323563.0], [62.5, 323563.0], [62.6, 323574.0], [62.7, 323574.0], [62.8, 323574.0], [62.9, 323574.0], [63.0, 323574.0], [63.1, 323574.0], [63.2, 323574.0], [63.3, 323574.0], [63.4, 323641.0], [63.5, 323641.0], [63.6, 323641.0], [63.7, 323641.0], [63.8, 323641.0], [63.9, 323641.0], [64.0, 323641.0], [64.1, 323641.0], [64.2, 323645.0], [64.3, 323645.0], [64.4, 323645.0], [64.5, 323645.0], [64.6, 323645.0], [64.7, 323645.0], [64.8, 323645.0], [64.9, 323645.0], [65.0, 323645.0], [65.1, 323666.0], [65.2, 323666.0], [65.3, 323666.0], [65.4, 323666.0], [65.5, 323666.0], [65.6, 323666.0], [65.7, 323666.0], [65.8, 323666.0], [65.9, 323690.0], [66.0, 323690.0], [66.1, 323690.0], [66.2, 323690.0], [66.3, 323690.0], [66.4, 323690.0], [66.5, 323690.0], [66.6, 323690.0], [66.7, 323779.0], [66.8, 323779.0], [66.9, 323779.0], [67.0, 323779.0], [67.1, 323779.0], [67.2, 323779.0], [67.3, 323779.0], [67.4, 323779.0], [67.5, 323779.0], [67.6, 323810.0], [67.7, 323810.0], [67.8, 323810.0], [67.9, 323810.0], [68.0, 323810.0], [68.1, 323810.0], [68.2, 323810.0], [68.3, 323810.0], [68.4, 323873.0], [68.5, 323873.0], [68.6, 323873.0], [68.7, 323873.0], [68.8, 323873.0], [68.9, 323873.0], [69.0, 323873.0], [69.1, 323873.0], [69.2, 323887.0], [69.3, 323887.0], [69.4, 323887.0], [69.5, 323887.0], [69.6, 323887.0], [69.7, 323887.0], [69.8, 323887.0], [69.9, 323887.0], [70.0, 323887.0], [70.1, 323996.0], [70.2, 323996.0], [70.3, 323996.0], [70.4, 323996.0], [70.5, 323996.0], [70.6, 323996.0], [70.7, 323996.0], [70.8, 323996.0], [70.9, 324219.0], [71.0, 324219.0], [71.1, 324219.0], [71.2, 324219.0], [71.3, 324219.0], [71.4, 324219.0], [71.5, 324219.0], [71.6, 324219.0], [71.7, 324258.0], [71.8, 324258.0], [71.9, 324258.0], [72.0, 324258.0], [72.1, 324258.0], [72.2, 324258.0], [72.3, 324258.0], [72.4, 324258.0], [72.5, 324258.0], [72.6, 324673.0], [72.7, 324673.0], [72.8, 324673.0], [72.9, 324673.0], [73.0, 324673.0], [73.1, 324673.0], [73.2, 324673.0], [73.3, 324673.0], [73.4, 324758.0], [73.5, 324758.0], [73.6, 324758.0], [73.7, 324758.0], [73.8, 324758.0], [73.9, 324758.0], [74.0, 324758.0], [74.1, 324758.0], [74.2, 324783.0], [74.3, 324783.0], [74.4, 324783.0], [74.5, 324783.0], [74.6, 324783.0], [74.7, 324783.0], [74.8, 324783.0], [74.9, 324783.0], [75.0, 324783.0], [75.1, 324888.0], [75.2, 324888.0], [75.3, 324888.0], [75.4, 324888.0], [75.5, 324888.0], [75.6, 324888.0], [75.7, 324888.0], [75.8, 324888.0], [75.9, 325033.0], [76.0, 325033.0], [76.1, 325033.0], [76.2, 325033.0], [76.3, 325033.0], [76.4, 325033.0], [76.5, 325033.0], [76.6, 325033.0], [76.7, 325152.0], [76.8, 325152.0], [76.9, 325152.0], [77.0, 325152.0], [77.1, 325152.0], [77.2, 325152.0], [77.3, 325152.0], [77.4, 325152.0], [77.5, 325453.0], [77.6, 325453.0], [77.7, 325453.0], [77.8, 325453.0], [77.9, 325453.0], [78.0, 325453.0], [78.1, 325453.0], [78.2, 325453.0], [78.3, 325453.0], [78.4, 325461.0], [78.5, 325461.0], [78.6, 325461.0], [78.7, 325461.0], [78.8, 325461.0], [78.9, 325461.0], [79.0, 325461.0], [79.1, 325461.0], [79.2, 325471.0], [79.3, 325471.0], [79.4, 325471.0], [79.5, 325471.0], [79.6, 325471.0], [79.7, 325471.0], [79.8, 325471.0], [79.9, 325471.0], [80.0, 325664.0], [80.1, 325664.0], [80.2, 325664.0], [80.3, 325664.0], [80.4, 325664.0], [80.5, 325664.0], [80.6, 325664.0], [80.7, 325664.0], [80.8, 325664.0], [80.9, 325823.0], [81.0, 325823.0], [81.1, 325823.0], [81.2, 325823.0], [81.3, 325823.0], [81.4, 325823.0], [81.5, 325823.0], [81.6, 325823.0], [81.7, 325860.0], [81.8, 325860.0], [81.9, 325860.0], [82.0, 325860.0], [82.1, 325860.0], [82.2, 325860.0], [82.3, 325860.0], [82.4, 325860.0], [82.5, 325899.0], [82.6, 325899.0], [82.7, 325899.0], [82.8, 325899.0], [82.9, 325899.0], [83.0, 325899.0], [83.1, 325899.0], [83.2, 325899.0], [83.3, 325899.0], [83.4, 326028.0], [83.5, 326028.0], [83.6, 326028.0], [83.7, 326028.0], [83.8, 326028.0], [83.9, 326028.0], [84.0, 326028.0], [84.1, 326028.0], [84.2, 326102.0], [84.3, 326102.0], [84.4, 326102.0], [84.5, 326102.0], [84.6, 326102.0], [84.7, 326102.0], [84.8, 326102.0], [84.9, 326102.0], [85.0, 326174.0], [85.1, 326174.0], [85.2, 326174.0], [85.3, 326174.0], [85.4, 326174.0], [85.5, 326174.0], [85.6, 326174.0], [85.7, 326174.0], [85.8, 326174.0], [85.9, 326289.0], [86.0, 326289.0], [86.1, 326289.0], [86.2, 326289.0], [86.3, 326289.0], [86.4, 326289.0], [86.5, 326289.0], [86.6, 326289.0], [86.7, 326311.0], [86.8, 326311.0], [86.9, 326311.0], [87.0, 326311.0], [87.1, 326311.0], [87.2, 326311.0], [87.3, 326311.0], [87.4, 326311.0], [87.5, 326330.0], [87.6, 326330.0], [87.7, 326330.0], [87.8, 326330.0], [87.9, 326330.0], [88.0, 326330.0], [88.1, 326330.0], [88.2, 326330.0], [88.3, 326330.0], [88.4, 326489.0], [88.5, 326489.0], [88.6, 326489.0], [88.7, 326489.0], [88.8, 326489.0], [88.9, 326489.0], [89.0, 326489.0], [89.1, 326489.0], [89.2, 326497.0], [89.3, 326497.0], [89.4, 326497.0], [89.5, 326497.0], [89.6, 326497.0], [89.7, 326497.0], [89.8, 326497.0], [89.9, 326497.0], [90.0, 326521.0], [90.1, 326521.0], [90.2, 326521.0], [90.3, 326521.0], [90.4, 326521.0], [90.5, 326521.0], [90.6, 326521.0], [90.7, 326521.0], [90.8, 326521.0], [90.9, 326664.0], [91.0, 326664.0], [91.1, 326664.0], [91.2, 326664.0], [91.3, 326664.0], [91.4, 326664.0], [91.5, 326664.0], [91.6, 326664.0], [91.7, 326840.0], [91.8, 326840.0], [91.9, 326840.0], [92.0, 326840.0], [92.1, 326840.0], [92.2, 326840.0], [92.3, 326840.0], [92.4, 326840.0], [92.5, 327306.0], [92.6, 327306.0], [92.7, 327306.0], [92.8, 327306.0], [92.9, 327306.0], [93.0, 327306.0], [93.1, 327306.0], [93.2, 327306.0], [93.3, 327306.0], [93.4, 327372.0], [93.5, 327372.0], [93.6, 327372.0], [93.7, 327372.0], [93.8, 327372.0], [93.9, 327372.0], [94.0, 327372.0], [94.1, 327372.0], [94.2, 327439.0], [94.3, 327439.0], [94.4, 327439.0], [94.5, 327439.0], [94.6, 327439.0], [94.7, 327439.0], [94.8, 327439.0], [94.9, 327439.0], [95.0, 327643.0], [95.1, 327643.0], [95.2, 327643.0], [95.3, 327643.0], [95.4, 327643.0], [95.5, 327643.0], [95.6, 327643.0], [95.7, 327643.0], [95.8, 327643.0], [95.9, 328383.0], [96.0, 328383.0], [96.1, 328383.0], [96.2, 328383.0], [96.3, 328383.0], [96.4, 328383.0], [96.5, 328383.0], [96.6, 328383.0], [96.7, 329318.0], [96.8, 329318.0], [96.9, 329318.0], [97.0, 329318.0], [97.1, 329318.0], [97.2, 329318.0], [97.3, 329318.0], [97.4, 329318.0], [97.5, 330205.0], [97.6, 330205.0], [97.7, 330205.0], [97.8, 330205.0], [97.9, 330205.0], [98.0, 330205.0], [98.1, 330205.0], [98.2, 330205.0], [98.3, 330205.0], [98.4, 330972.0], [98.5, 330972.0], [98.6, 330972.0], [98.7, 330972.0], [98.8, 330972.0], [98.9, 330972.0], [99.0, 330972.0], [99.1, 330972.0], [99.2, 334098.0], [99.3, 334098.0], [99.4, 334098.0], [99.5, 334098.0], [99.6, 334098.0], [99.7, 334098.0], [99.8, 334098.0], [99.9, 334098.0]], "isOverall": false, "label": "HTTP Request", "isController": false}], "supportsControllersDiscrimination": true, "maxX": 100.0, "title": "Response Time Percentiles"}},
        getOptions: function() {
            return {
                series: {
                    points: { show: false }
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: '#legendResponseTimePercentiles'
                },
                xaxis: {
                    tickDecimals: 1,
                    axisLabel: "Percentiles",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Percentile value in ms",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s : %x.2 percentile was %y ms"
                },
                selection: { mode: "xy" },
            };
        },
        createGraph: function() {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesResponseTimePercentiles"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotResponseTimesPercentiles"), dataset, options);
            // setup overview
            $.plot($("#overviewResponseTimesPercentiles"), dataset, prepareOverviewOptions(options));
        }
};

// Response times percentiles
function refreshResponseTimePercentiles() {
    var infos = responseTimePercentilesInfos;
    prepareSeries(infos.data);
    if (isGraph($("#flotResponseTimesPercentiles"))){
        infos.createGraph();
    } else {
        var choiceContainer = $("#choicesResponseTimePercentiles");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotResponseTimesPercentiles", "#overviewResponseTimesPercentiles");
        $('#bodyResponseTimePercentiles .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
}

var responseTimeDistributionInfos = {
        data: {"result": {"minY": 1.0, "minX": 302300.0, "maxY": 4.0, "series": [{"data": [[304900.0, 1.0], [320100.0, 2.0], [316900.0, 1.0], [322500.0, 1.0], [326500.0, 1.0], [327300.0, 2.0], [323300.0, 1.0], [321700.0, 1.0], [317700.0, 1.0], [320900.0, 1.0], [303200.0, 1.0], [324800.0, 1.0], [316000.0, 1.0], [326400.0, 2.0], [325600.0, 1.0], [320800.0, 1.0], [322400.0, 2.0], [316800.0, 1.0], [318400.0, 1.0], [313600.0, 1.0], [315200.0, 1.0], [308300.0, 1.0], [309100.0, 1.0], [317100.0, 2.0], [322700.0, 1.0], [325100.0, 1.0], [323500.0, 2.0], [321100.0, 1.0], [316300.0, 1.0], [328300.0, 1.0], [326600.0, 1.0], [321000.0, 3.0], [319400.0, 2.0], [323400.0, 2.0], [321800.0, 2.0], [322600.0, 3.0], [325800.0, 3.0], [325000.0, 1.0], [324200.0, 2.0], [327400.0, 1.0], [326100.0, 2.0], [312500.0, 1.0], [322900.0, 1.0], [318900.0, 1.0], [320500.0, 1.0], [321300.0, 1.0], [323700.0, 1.0], [319700.0, 1.0], [318100.0, 1.0], [315700.0, 1.0], [330900.0, 1.0], [329300.0, 1.0], [307600.0, 1.0], [326800.0, 1.0], [322000.0, 3.0], [323600.0, 4.0], [318000.0, 1.0], [326000.0, 1.0], [321200.0, 3.0], [327600.0, 1.0], [319600.0, 1.0], [322800.0, 1.0], [320400.0, 3.0], [334000.0, 1.0], [302300.0, 1.0], [311100.0, 1.0], [320700.0, 2.0], [321500.0, 3.0], [323900.0, 1.0], [319100.0, 1.0], [322300.0, 2.0], [323100.0, 1.0], [326300.0, 2.0], [324700.0, 2.0], [321400.0, 3.0], [320600.0, 1.0], [323800.0, 3.0], [325400.0, 3.0], [326200.0, 1.0], [323000.0, 1.0], [324600.0, 1.0], [330200.0, 1.0]], "isOverall": false, "label": "HTTP Request", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 100, "maxX": 334000.0, "title": "Response Time Distribution"}},
        getOptions: function() {
            var granularity = this.data.result.granularity;
            return {
                legend: {
                    noColumns: 2,
                    show: true,
                    container: '#legendResponseTimeDistribution'
                },
                xaxis:{
                    axisLabel: "Response times in ms",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Number of responses",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                bars : {
                    show: true,
                    barWidth: this.data.result.granularity
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: function(label, xval, yval, flotItem){
                        return yval + " responses for " + label + " were between " + xval + " and " + (xval + granularity) + " ms";
                    }
                }
            };
        },
        createGraph: function() {
            var data = this.data;
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotResponseTimeDistribution"), prepareData(data.result.series, $("#choicesResponseTimeDistribution")), options);
        }

};

// Response time distribution
function refreshResponseTimeDistribution() {
    var infos = responseTimeDistributionInfos;
    prepareSeries(infos.data);
    if (isGraph($("#flotResponseTimeDistribution"))){
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesResponseTimeDistribution");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        $('#footerResponseTimeDistribution .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};


var syntheticResponseTimeDistributionInfos = {
        data: {"result": {"minY": 120.0, "minX": 2.0, "ticks": [[0, "Requests having \nresponse time <= 500ms"], [1, "Requests having \nresponse time > 500ms and <= 1,500ms"], [2, "Requests having \nresponse time > 1,500ms"], [3, "Requests in error"]], "maxY": 120.0, "series": [{"data": [[2.0, 120.0]], "isOverall": false, "label": "Requests having \nresponse time > 1,500ms", "isController": false}], "supportsControllersDiscrimination": false, "maxX": 2.0, "title": "Synthetic Response Times Distribution"}},
        getOptions: function() {
            return {
                legend: {
                    noColumns: 2,
                    show: true,
                    container: '#legendSyntheticResponseTimeDistribution'
                },
                xaxis:{
                    axisLabel: "Response times ranges",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                    tickLength:0,
                    min:-0.5,
                    max:3.5
                },
                yaxis: {
                    axisLabel: "Number of responses",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                bars : {
                    show: true,
                    align: "center",
                    barWidth: 0.25,
                    fill:.75
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: function(label, xval, yval, flotItem){
                        return yval + " " + label;
                    }
                },
                colors: ["#9ACD32", "yellow", "orange", "#FF6347"]                
            };
        },
        createGraph: function() {
            var data = this.data;
            var options = this.getOptions();
            prepareOptions(options, data);
            options.xaxis.ticks = data.result.ticks;
            $.plot($("#flotSyntheticResponseTimeDistribution"), prepareData(data.result.series, $("#choicesSyntheticResponseTimeDistribution")), options);
        }

};

// Response time distribution
function refreshSyntheticResponseTimeDistribution() {
    var infos = syntheticResponseTimeDistributionInfos;
    prepareSeries(infos.data, true);
    if (isGraph($("#flotSyntheticResponseTimeDistribution"))){
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesSyntheticResponseTimeDistribution");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        $('#footerSyntheticResponseTimeDistribution .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};

var activeThreadsOverTimeInfos = {
        data: {"result": {"minY": 13.576923076923075, "minX": 1.52081184E12, "maxY": 60.0, "series": [{"data": [[1.52081184E12, 60.0], [1.5208122E12, 13.576923076923075], [1.52081214E12, 43.58823529411766]], "isOverall": false, "label": "Thread Group", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.5208122E12, "title": "Active Threads Over Time"}},
        getOptions: function() {
            return {
                series: {
                    stack: true,
                    lines: {
                        show: true,
                        fill: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getElapsedTimeLabel(this.data.result.granularity),
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Number of active threads",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20
                },
                legend: {
                    noColumns: 6,
                    show: true,
                    container: '#legendActiveThreadsOverTime'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                selection: {
                    mode: 'xy'
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s : At %x there were %y active threads"
                }
            };
        },
        createGraph: function() {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesActiveThreadsOverTime"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotActiveThreadsOverTime"), dataset, options);
            // setup overview
            $.plot($("#overviewActiveThreadsOverTime"), dataset, prepareOverviewOptions(options));
        }
};

// Active Threads Over Time
function refreshActiveThreadsOverTime(fixTimestamps) {
    var infos = activeThreadsOverTimeInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, -25200000);
    }
    if(isGraph($("#flotActiveThreadsOverTime"))) {
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesActiveThreadsOverTime");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotActiveThreadsOverTime", "#overviewActiveThreadsOverTime");
        $('#footerActiveThreadsOverTime .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};

var timeVsThreadsInfos = {
        data: {"result": {"minY": 315226.0, "minX": 1.0, "maxY": 334098.0, "series": [{"data": [[2.0, 315226.0], [3.0, 321466.0], [4.0, 320446.0], [6.0, 315878.0], [7.0, 321293.0], [8.0, 320151.0], [9.0, 319175.0], [11.0, 316930.0], [12.0, 321060.0], [13.0, 320409.0], [14.0, 318481.0], [15.0, 316805.0], [16.0, 320978.0], [17.0, 317755.0], [18.0, 322448.0], [19.0, 321214.0], [20.0, 322038.0], [21.0, 322430.0], [22.0, 319724.0], [23.0, 334098.0], [24.0, 320808.0], [25.0, 323873.0], [26.0, 322840.0], [27.0, 316343.0], [28.0, 323810.0], [29.0, 322039.0], [30.0, 323641.0], [31.0, 323666.0], [33.0, 322638.0], [32.0, 319692.0], [35.0, 322610.5], [37.0, 320780.0], [36.0, 321357.0], [39.0, 320138.0], [38.0, 322607.0], [41.0, 325033.0], [40.0, 321792.0], [43.0, 321118.0], [42.0, 323563.0], [45.0, 322864.0], [47.0, 321433.0], [49.0, 318912.0], [48.0, 327643.0], [51.0, 324673.0], [50.0, 322605.0], [53.0, 324758.0], [52.0, 323574.0], [55.0, 323690.0], [54.0, 327439.0], [57.0, 329318.0], [56.0, 326174.0], [59.0, 325899.0], [58.0, 323361.0], [60.0, 321589.03278688516], [1.0, 320485.0]], "isOverall": false, "label": "HTTP Request", "isController": false}, {"data": [[45.29166666666668, 321715.23333333316]], "isOverall": false, "label": "HTTP Request-Aggregated", "isController": false}], "supportsControllersDiscrimination": true, "maxX": 60.0, "title": "Time VS Threads"}},
        getOptions: function() {
            return {
                series: {
                    lines: {
                        show: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    axisLabel: "Number of active threads",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Average response times in ms",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20
                },
                legend: { noColumns: 2,show: true, container: '#legendTimeVsThreads' },
                selection: {
                    mode: 'xy'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s: At %x.2 active threads, Average response time was %y.2 ms"
                }
            };
        },
        createGraph: function() {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesTimeVsThreads"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotTimesVsThreads"), dataset, options);
            // setup overview
            $.plot($("#overviewTimesVsThreads"), dataset, prepareOverviewOptions(options));
        }
};

// Time vs threads
function refreshTimeVsThreads(){
    var infos = timeVsThreadsInfos;
    prepareSeries(infos.data);
    if(isGraph($("#flotTimesVsThreads"))){
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesTimeVsThreads");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotTimesVsThreads", "#overviewTimesVsThreads");
        $('#footerTimeVsThreads .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};

var bytesThroughputOverTimeInfos = {
        data : {"result": {"minY": 55.03333333333333, "minX": 1.52081184E12, "maxY": 43293.0, "series": [{"data": [[1.52081184E12, 43293.0], [1.5208122E12, 18760.3], [1.52081214E12, 24532.7]], "isOverall": false, "label": "Bytes received per second", "isController": false}, {"data": [[1.52081184E12, 127.0], [1.5208122E12, 55.03333333333333], [1.52081214E12, 71.96666666666667]], "isOverall": false, "label": "Bytes sent per second", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.5208122E12, "title": "Bytes Throughput Over Time"}},
        getOptions : function(){
            return {
                series: {
                    lines: {
                        show: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getElapsedTimeLabel(this.data.result.granularity) ,
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Bytes / sec",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: '#legendBytesThroughputOverTime'
                },
                selection: {
                    mode: "xy"
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s at %x was %y"
                }
            };
        },
        createGraph : function() {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesBytesThroughputOverTime"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotBytesThroughputOverTime"), dataset, options);
            // setup overview
            $.plot($("#overviewBytesThroughputOverTime"), dataset, prepareOverviewOptions(options));
        }
};

// Bytes throughput Over Time
function refreshBytesThroughputOverTime(fixTimestamps) {
    var infos = bytesThroughputOverTimeInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, -25200000);
    }
    if(isGraph($("#flotBytesThroughputOverTime"))){
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesBytesThroughputOverTime");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotBytesThroughputOverTime", "#overviewBytesThroughputOverTime");
        $('#footerBytesThroughputOverTime .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
}

var responseTimesOverTimeInfos = {
        data: {"result": {"minY": 320339.1923076923, "minX": 1.52081184E12, "maxY": 322980.7647058824, "series": [{"data": [[1.52081184E12, 321594.38333333324], [1.5208122E12, 320339.1923076923], [1.52081214E12, 322980.7647058824]], "isOverall": false, "label": "HTTP Request", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.5208122E12, "title": "Response Time Over Time"}},
        getOptions: function(){
            return {
                series: {
                    lines: {
                        show: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getElapsedTimeLabel(this.data.result.granularity),
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Average response time in ms",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: '#legendResponseTimesOverTime'
                },
                selection: {
                    mode: 'xy'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s : at %x Average response time was %y ms"
                }
            };
        },
        createGraph: function() {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesResponseTimesOverTime"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotResponseTimesOverTime"), dataset, options);
            // setup overview
            $.plot($("#overviewResponseTimesOverTime"), dataset, prepareOverviewOptions(options));
        }
};

// Response Times Over Time
function refreshResponseTimeOverTime(fixTimestamps) {
    var infos = responseTimesOverTimeInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, -25200000);
    }
    if(isGraph($("#flotResponseTimesOverTime"))){
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesResponseTimesOverTime");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotResponseTimesOverTime", "#overviewResponseTimesOverTime");
        $('#footerResponseTimesOverTime .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};

var latenciesOverTimeInfos = {
        data: {"result": {"minY": 59563.85, "minX": 1.52081184E12, "maxY": 63845.53846153847, "series": [{"data": [[1.52081184E12, 59563.85], [1.5208122E12, 63845.53846153847], [1.52081214E12, 63066.588235294104]], "isOverall": false, "label": "HTTP Request", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.5208122E12, "title": "Latencies Over Time"}},
        getOptions: function() {
            return {
                series: {
                    lines: {
                        show: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getElapsedTimeLabel(this.data.result.granularity),
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Average response latencies in ms",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: '#legendLatenciesOverTime'
                },
                selection: {
                    mode: 'xy'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s : at %x Average latency was %y ms"
                }
            };
        },
        createGraph: function () {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesLatenciesOverTime"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotLatenciesOverTime"), dataset, options);
            // setup overview
            $.plot($("#overviewLatenciesOverTime"), dataset, prepareOverviewOptions(options));
        }
};

// Latencies Over Time
function refreshLatenciesOverTime(fixTimestamps) {
    var infos = latenciesOverTimeInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, -25200000);
    }
    if(isGraph($("#flotLatenciesOverTime"))) {
        infos.createGraph();
    }else {
        var choiceContainer = $("#choicesLatenciesOverTime");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotLatenciesOverTime", "#overviewLatenciesOverTime");
        $('#footerLatenciesOverTime .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};

var connectTimeOverTimeInfos = {
        data: {"result": {"minY": 8.147058823529411, "minX": 1.52081184E12, "maxY": 8.600000000000001, "series": [{"data": [[1.52081184E12, 8.600000000000001], [1.5208122E12, 8.153846153846155], [1.52081214E12, 8.147058823529411]], "isOverall": false, "label": "HTTP Request", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.5208122E12, "title": "Connect Time Over Time"}},
        getOptions: function() {
            return {
                series: {
                    lines: {
                        show: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getConnectTimeLabel(this.data.result.granularity),
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Average Connect Time in ms",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: '#legendConnectTimeOverTime'
                },
                selection: {
                    mode: 'xy'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s : at %x Average connect time was %y ms"
                }
            };
        },
        createGraph: function () {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesConnectTimeOverTime"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotConnectTimeOverTime"), dataset, options);
            // setup overview
            $.plot($("#overviewConnectTimeOverTime"), dataset, prepareOverviewOptions(options));
        }
};

// Connect Time Over Time
function refreshConnectTimeOverTime(fixTimestamps) {
    var infos = connectTimeOverTimeInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, -25200000);
    }
    if(isGraph($("#flotConnectTimeOverTime"))) {
        infos.createGraph();
    }else {
        var choiceContainer = $("#choicesConnectTimeOverTime");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotConnectTimeOverTime", "#overviewConnectTimeOverTime");
        $('#footerConnectTimeOverTime .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};

var responseTimePercentilesOverTimeInfos = {
        data: {"result": {"minY": 302378.0, "minX": 1.52081184E12, "maxY": 334098.0, "series": [{"data": [[1.52081184E12, 330972.0], [1.5208122E12, 334098.0], [1.52081214E12, 329318.0]], "isOverall": false, "label": "Max", "isController": false}, {"data": [[1.52081184E12, 302378.0], [1.5208122E12, 313692.0], [1.52081214E12, 316343.0]], "isOverall": false, "label": "Min", "isController": false}, {"data": [[1.52081184E12, 326822.4], [1.5208122E12, 326518.6], [1.52081214E12, 326752.0]], "isOverall": false, "label": "90th percentile", "isController": false}, {"data": [[1.52081184E12, 330972.0], [1.5208122E12, 333441.54], [1.52081214E12, 330972.0]], "isOverall": false, "label": "99th percentile", "isController": false}, {"data": [[1.52081184E12, 328332.45], [1.5208122E12, 327632.8], [1.52081214E12, 327828.0]], "isOverall": false, "label": "95th percentile", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.5208122E12, "title": "Response Time Percentiles Over Time (successful requests only)"}},
        getOptions: function() {
            return {
                series: {
                    lines: {
                        show: true,
                        fill: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getElapsedTimeLabel(this.data.result.granularity),
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Response Time in ms",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: '#legendResponseTimePercentilesOverTime'
                },
                selection: {
                    mode: 'xy'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s : at %x Response time was %y ms"
                }
            };
        },
        createGraph: function () {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesResponseTimePercentilesOverTime"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotResponseTimePercentilesOverTime"), dataset, options);
            // setup overview
            $.plot($("#overviewResponseTimePercentilesOverTime"), dataset, prepareOverviewOptions(options));
        }
};

// Response Time Percentiles Over Time
function refreshResponseTimePercentilesOverTime(fixTimestamps) {
    var infos = responseTimePercentilesOverTimeInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, -25200000);
    }
    if(isGraph($("#flotResponseTimePercentilesOverTime"))) {
        infos.createGraph();
    }else {
        var choiceContainer = $("#choicesResponseTimePercentilesOverTime");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotResponseTimePercentilesOverTime", "#overviewResponseTimePercentilesOverTime");
        $('#footerResponseTimePercentilesOverTime .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};


var responseTimeVsRequestInfos = {
    data: {"result": {"minY": 321487.5, "minX": 0.0, "maxY": 323291.5, "series": [{"data": [[1.0, 323291.5], [0.0, 321487.5]], "isOverall": false, "label": "Successes", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.0, "title": "Response Time Vs Request"}},
    getOptions: function() {
        return {
            series: {
                lines: {
                    show: false
                },
                points: {
                    show: true
                }
            },
            xaxis: {
                axisLabel: "Global number of requests per second",
                axisLabelUseCanvas: true,
                axisLabelFontSizePixels: 12,
                axisLabelFontFamily: 'Verdana, Arial',
                axisLabelPadding: 20,
            },
            yaxis: {
                axisLabel: "Median Response Time in ms",
                axisLabelUseCanvas: true,
                axisLabelFontSizePixels: 12,
                axisLabelFontFamily: 'Verdana, Arial',
                axisLabelPadding: 20,
            },
            legend: {
                noColumns: 2,
                show: true,
                container: '#legendResponseTimeVsRequest'
            },
            selection: {
                mode: 'xy'
            },
            grid: {
                hoverable: true // IMPORTANT! this is needed for tooltip to work
            },
            tooltip: true,
            tooltipOpts: {
                content: "%s : Median response time at %x req/s was %y ms"
            },
            colors: ["#9ACD32", "#FF6347"]
        };
    },
    createGraph: function () {
        var data = this.data;
        var dataset = prepareData(data.result.series, $("#choicesResponseTimeVsRequest"));
        var options = this.getOptions();
        prepareOptions(options, data);
        $.plot($("#flotResponseTimeVsRequest"), dataset, options);
        // setup overview
        $.plot($("#overviewResponseTimeVsRequest"), dataset, prepareOverviewOptions(options));

    }
};

// Response Time vs Request
function refreshResponseTimeVsRequest() {
    var infos = responseTimeVsRequestInfos;
    prepareSeries(infos.data);
    if (isGraph($("#flotResponseTimeVsRequest"))){
        infos.create();
    }else{
        var choiceContainer = $("#choicesResponseTimeVsRequest");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotResponseTimeVsRequest", "#overviewResponseTimeVsRequest");
        $('#footerResponseRimeVsRequest .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};


var latenciesVsRequestInfos = {
    data: {"result": {"minY": 61510.0, "minX": 0.0, "maxY": 63482.0, "series": [{"data": [[1.0, 61510.0], [0.0, 63482.0]], "isOverall": false, "label": "Successes", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.0, "title": "Latencies Vs Request"}},
    getOptions: function() {
        return{
            series: {
                lines: {
                    show: false
                },
                points: {
                    show: true
                }
            },
            xaxis: {
                axisLabel: "Global number of requests per second",
                axisLabelUseCanvas: true,
                axisLabelFontSizePixels: 12,
                axisLabelFontFamily: 'Verdana, Arial',
                axisLabelPadding: 20,
            },
            yaxis: {
                axisLabel: "Median Latency in ms",
                axisLabelUseCanvas: true,
                axisLabelFontSizePixels: 12,
                axisLabelFontFamily: 'Verdana, Arial',
                axisLabelPadding: 20,
            },
            legend: { noColumns: 2,show: true, container: '#legendLatencyVsRequest' },
            selection: {
                mode: 'xy'
            },
            grid: {
                hoverable: true // IMPORTANT! this is needed for tooltip to work
            },
            tooltip: true,
            tooltipOpts: {
                content: "%s : Median response time at %x req/s was %y ms"
            },
            colors: ["#9ACD32", "#FF6347"]
        };
    },
    createGraph: function () {
        var data = this.data;
        var dataset = prepareData(data.result.series, $("#choicesLatencyVsRequest"));
        var options = this.getOptions();
        prepareOptions(options, data);
        $.plot($("#flotLatenciesVsRequest"), dataset, options);
        // setup overview
        $.plot($("#overviewLatenciesVsRequest"), dataset, prepareOverviewOptions(options));
    }
};

// Latencies vs Request
function refreshLatenciesVsRequest() {
        var infos = latenciesVsRequestInfos;
        prepareSeries(infos.data);
        if(isGraph($("#flotLatenciesVsRequest"))){
            infos.createGraph();
        }else{
            var choiceContainer = $("#choicesLatencyVsRequest");
            createLegend(choiceContainer, infos);
            infos.createGraph();
            setGraphZoomable("#flotLatenciesVsRequest", "#overviewLatenciesVsRequest");
            $('#footerLatenciesVsRequest .legendColorBox > div').each(function(i){
                $(this).clone().prependTo(choiceContainer.find("li").eq(i));
            });
        }
};

var hitsPerSecondInfos = {
        data: {"result": {"minY": 1.0, "minX": 1.52081154E12, "maxY": 1.0, "series": [{"data": [[1.52081184E12, 1.0], [1.52081154E12, 1.0]], "isOverall": false, "label": "hitsPerSecond", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.52081184E12, "title": "Hits Per Second"}},
        getOptions: function() {
            return {
                series: {
                    lines: {
                        show: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getElapsedTimeLabel(this.data.result.granularity),
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Number of hits / sec",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: "#legendHitsPerSecond"
                },
                selection: {
                    mode : 'xy'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s at %x was %y.2 hits/sec"
                }
            };
        },
        createGraph: function createGraph() {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesHitsPerSecond"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotHitsPerSecond"), dataset, options);
            // setup overview
            $.plot($("#overviewHitsPerSecond"), dataset, prepareOverviewOptions(options));
        }
};

// Hits per second
function refreshHitsPerSecond(fixTimestamps) {
    var infos = hitsPerSecondInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, -25200000);
    }
    if (isGraph($("#flotHitsPerSecond"))){
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesHitsPerSecond");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotHitsPerSecond", "#overviewHitsPerSecond");
        $('#footerHitsPerSecond .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
}

var codesPerSecondInfos = {
        data: {"result": {"minY": 0.43333333333333335, "minX": 1.52081184E12, "maxY": 1.0, "series": [{"data": [[1.52081184E12, 1.0], [1.5208122E12, 0.43333333333333335], [1.52081214E12, 0.5666666666666667]], "isOverall": false, "label": "200", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.5208122E12, "title": "Codes Per Second"}},
        getOptions: function(){
            return {
                series: {
                    lines: {
                        show: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getElapsedTimeLabel(this.data.result.granularity),
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Number of responses / sec",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: "#legendCodesPerSecond"
                },
                selection: {
                    mode: 'xy'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "Number of Response Codes %s at %x was %y.2 responses / sec"
                }
            };
        },
    createGraph: function() {
        var data = this.data;
        var dataset = prepareData(data.result.series, $("#choicesCodesPerSecond"));
        var options = this.getOptions();
        prepareOptions(options, data);
        $.plot($("#flotCodesPerSecond"), dataset, options);
        // setup overview
        $.plot($("#overviewCodesPerSecond"), dataset, prepareOverviewOptions(options));
    }
};

// Codes per second
function refreshCodesPerSecond(fixTimestamps) {
    var infos = codesPerSecondInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, -25200000);
    }
    if(isGraph($("#flotCodesPerSecond"))){
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesCodesPerSecond");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotCodesPerSecond", "#overviewCodesPerSecond");
        $('#footerCodesPerSecond .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};

var transactionsPerSecondInfos = {
        data: {"result": {"minY": 0.43333333333333335, "minX": 1.52081184E12, "maxY": 1.0, "series": [{"data": [[1.52081184E12, 1.0], [1.5208122E12, 0.43333333333333335], [1.52081214E12, 0.5666666666666667]], "isOverall": false, "label": "HTTP Request-success", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.5208122E12, "title": "Transactions Per Second"}},
        getOptions: function(){
            return {
                series: {
                    lines: {
                        show: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getElapsedTimeLabel(this.data.result.granularity),
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Number of transactions / sec",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: "#legendTransactionsPerSecond"
                },
                selection: {
                    mode: 'xy'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s at %x was %y transactions / sec"
                }
            };
        },
    createGraph: function () {
        var data = this.data;
        var dataset = prepareData(data.result.series, $("#choicesTransactionsPerSecond"));
        var options = this.getOptions();
        prepareOptions(options, data);
        $.plot($("#flotTransactionsPerSecond"), dataset, options);
        // setup overview
        $.plot($("#overviewTransactionsPerSecond"), dataset, prepareOverviewOptions(options));
    }
};

// Transactions per second
function refreshTransactionsPerSecond(fixTimestamps) {
    var infos = transactionsPerSecondInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, -25200000);
    }
    if(isGraph($("#flotTransactionsPerSecond"))){
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesTransactionsPerSecond");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotTransactionsPerSecond", "#overviewTransactionsPerSecond");
        $('#footerTransactionsPerSecond .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};

// Collapse the graph matching the specified DOM element depending the collapsed
// status
function collapse(elem, collapsed){
    if(collapsed){
        $(elem).parent().find(".fa-chevron-up").removeClass("fa-chevron-up").addClass("fa-chevron-down");
    } else {
        $(elem).parent().find(".fa-chevron-down").removeClass("fa-chevron-down").addClass("fa-chevron-up");
        if (elem.id == "bodyBytesThroughputOverTime") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshBytesThroughputOverTime(true);
            }
            document.location.href="#bytesThroughputOverTime";
        } else if (elem.id == "bodyLatenciesOverTime") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshLatenciesOverTime(true);
            }
            document.location.href="#latenciesOverTime";
        } else if (elem.id == "bodyConnectTimeOverTime") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshConnectTimeOverTime(true);
            }
            document.location.href="#connectTimeOverTime";
        } else if (elem.id == "bodyResponseTimePercentilesOverTime") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshResponseTimePercentilesOverTime(true);
            }
            document.location.href="#responseTimePercentilesOverTime";
        } else if (elem.id == "bodyResponseTimeDistribution") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshResponseTimeDistribution();
            }
            document.location.href="#responseTimeDistribution" ;
        } else if (elem.id == "bodySyntheticResponseTimeDistribution") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshSyntheticResponseTimeDistribution();
            }
            document.location.href="#syntheticResponseTimeDistribution" ;
        } else if (elem.id == "bodyActiveThreadsOverTime") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshActiveThreadsOverTime(true);
            }
            document.location.href="#activeThreadsOverTime";
        } else if (elem.id == "bodyTimeVsThreads") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshTimeVsThreads();
            }
            document.location.href="#timeVsThreads" ;
        } else if (elem.id == "bodyCodesPerSecond") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshCodesPerSecond(true);
            }
            document.location.href="#codesPerSecond";
        } else if (elem.id == "bodyTransactionsPerSecond") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshTransactionsPerSecond(true);
            }
            document.location.href="#transactionsPerSecond";
        } else if (elem.id == "bodyResponseTimeVsRequest") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshResponseTimeVsRequest();
            }
            document.location.href="#responseTimeVsRequest";
        } else if (elem.id == "bodyLatenciesVsRequest") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshLatenciesVsRequest();
            }
            document.location.href="#latencyVsRequest";
        }
    }
}

// Collapse
$(function() {
        $('.collapse').on('shown.bs.collapse', function(){
            collapse(this, false);
        }).on('hidden.bs.collapse', function(){
            collapse(this, true);
        });
});

$(function() {
    $(".glyphicon").mousedown( function(event){
        var tmp = $('.in:not(ul)');
        tmp.parent().parent().parent().find(".fa-chevron-up").removeClass("fa-chevron-down").addClass("fa-chevron-down");
        tmp.removeClass("in");
        tmp.addClass("out");
    });
});

/*
 * Activates or deactivates all series of the specified graph (represented by id parameter)
 * depending on checked argument.
 */
function toggleAll(id, checked){
    var placeholder = document.getElementById(id);

    var cases = $(placeholder).find(':checkbox');
    cases.prop('checked', checked);
    $(cases).parent().children().children().toggleClass("legend-disabled", !checked);

    var choiceContainer;
    if ( id == "choicesBytesThroughputOverTime"){
        choiceContainer = $("#choicesBytesThroughputOverTime");
        refreshBytesThroughputOverTime(false);
    } else if(id == "choicesResponseTimesOverTime"){
        choiceContainer = $("#choicesResponseTimesOverTime");
        refreshResponseTimeOverTime(false);
    } else if ( id == "choicesLatenciesOverTime"){
        choiceContainer = $("#choicesLatenciesOverTime");
        refreshLatenciesOverTime(false);
    } else if ( id == "choicesConnectTimeOverTime"){
        choiceContainer = $("#choicesConnectTimeOverTime");
        refreshConnectTimeOverTime(false);
    } else if ( id == "responseTimePercentilesOverTime"){
        choiceContainer = $("#choicesResponseTimePercentilesOverTime");
        refreshResponseTimePercentilesOverTime(false);
    } else if ( id == "choicesResponseTimePercentiles"){
        choiceContainer = $("#choicesResponseTimePercentiles");
        refreshResponseTimePercentiles();
    } else if(id == "choicesActiveThreadsOverTime"){
        choiceContainer = $("#choicesActiveThreadsOverTime");
        refreshActiveThreadsOverTime(false);
    } else if ( id == "choicesTimeVsThreads"){
        choiceContainer = $("#choicesTimeVsThreads");
        refreshTimeVsThreads();
    } else if ( id == "choicesSyntheticResponseTimeDistribution"){
        choiceContainer = $("#choicesSyntheticResponseTimeDistribution");
        refreshSyntheticResponseTimeDistribution();
    } else if ( id == "choicesResponseTimeDistribution"){
        choiceContainer = $("#choicesResponseTimeDistribution");
        refreshResponseTimeDistribution();
    } else if ( id == "choicesHitsPerSecond"){
        choiceContainer = $("#choicesHitsPerSecond");
        refreshHitsPerSecond(false);
    } else if(id == "choicesCodesPerSecond"){
        choiceContainer = $("#choicesCodesPerSecond");
        refreshCodesPerSecond(false);
    } else if ( id == "choicesTransactionsPerSecond"){
        choiceContainer = $("#choicesTransactionsPerSecond");
        refreshTransactionsPerSecond(false);
    } else if ( id == "choicesResponseTimeVsRequest"){
        choiceContainer = $("#choicesResponseTimeVsRequest");
        refreshResponseTimeVsRequest();
    } else if ( id == "choicesLatencyVsRequest"){
        choiceContainer = $("#choicesLatencyVsRequest");
        refreshLatenciesVsRequest();
    }
    var color = checked ? "black" : "#818181";
    choiceContainer.find("label").each(function(){
        this.style.color = color;
    });
}

// Unchecks all boxes for "Hide all samples" functionality
function uncheckAll(id){
    toggleAll(id, false);
}

// Checks all boxes for "Show all samples" functionality
function checkAll(id){
    toggleAll(id, true);
}

// Prepares data to be consumed by plot plugins
function prepareData(series, choiceContainer, customizeSeries){
    var datasets = [];

    // Add only selected series to the data set
    choiceContainer.find("input:checked").each(function (index, item) {
        var key = $(item).attr("name");
        var i = 0;
        var size = series.length;
        while(i < size && series[i].label != key)
            i++;
        if(i < size){
            var currentSeries = series[i];
            datasets.push(currentSeries);
            if(customizeSeries)
                customizeSeries(currentSeries);
        }
    });
    return datasets;
}

/*
 * Ignore case comparator
 */
function sortAlphaCaseless(a,b){
    return a.toLowerCase() > b.toLowerCase() ? 1 : -1;
};

/*
 * Creates a legend in the specified element with graph information
 */
function createLegend(choiceContainer, infos) {
    // Sort series by name
    var keys = [];
    $.each(infos.data.result.series, function(index, series){
        keys.push(series.label);
    });
    keys.sort(sortAlphaCaseless);

    // Create list of series with support of activation/deactivation
    $.each(keys, function(index, key) {
        var id = choiceContainer.attr('id') + index;
        $('<li />')
            .append($('<input id="' + id + '" name="' + key + '" type="checkbox" checked="checked" hidden />'))
            .append($('<label />', { 'text': key , 'for': id }))
            .appendTo(choiceContainer);
    });
    choiceContainer.find("label").click( function(){
        if (this.style.color !== "rgb(129, 129, 129)" ){
            this.style.color="#818181";
        }else {
            this.style.color="black";
        }
        $(this).parent().children().children().toggleClass("legend-disabled");
    });
    choiceContainer.find("label").mousedown( function(event){
        event.preventDefault();
    });
    choiceContainer.find("label").mouseenter(function(){
        this.style.cursor="pointer";
    });

    // Recreate graphe on series activation toggle
    choiceContainer.find("input").click(function(){
        infos.createGraph();
    });
}
