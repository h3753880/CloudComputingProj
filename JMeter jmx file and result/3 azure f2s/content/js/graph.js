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
        var xOffset = options.xaxis.mode === "time" ? -28800000 : 0;
        var yOffset = options.yaxis.mode === "time" ? -28800000 : 0;

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
        data: {"result": {"minY": 228124.0, "minX": 0.0, "maxY": 259305.0, "series": [{"data": [[0.0, 228124.0], [0.1, 228124.0], [0.2, 228124.0], [0.3, 228124.0], [0.4, 228124.0], [0.5, 228124.0], [0.6, 228124.0], [0.7, 228124.0], [0.8, 228124.0], [0.9, 232003.0], [1.0, 232003.0], [1.1, 232003.0], [1.2, 232003.0], [1.3, 232003.0], [1.4, 232003.0], [1.5, 232003.0], [1.6, 232003.0], [1.7, 234460.0], [1.8, 234460.0], [1.9, 234460.0], [2.0, 234460.0], [2.1, 234460.0], [2.2, 234460.0], [2.3, 234460.0], [2.4, 234460.0], [2.5, 234843.0], [2.6, 234843.0], [2.7, 234843.0], [2.8, 234843.0], [2.9, 234843.0], [3.0, 234843.0], [3.1, 234843.0], [3.2, 234843.0], [3.3, 234843.0], [3.4, 235668.0], [3.5, 235668.0], [3.6, 235668.0], [3.7, 235668.0], [3.8, 235668.0], [3.9, 235668.0], [4.0, 235668.0], [4.1, 235668.0], [4.2, 236223.0], [4.3, 236223.0], [4.4, 236223.0], [4.5, 236223.0], [4.6, 236223.0], [4.7, 236223.0], [4.8, 236223.0], [4.9, 236223.0], [5.0, 236577.0], [5.1, 236577.0], [5.2, 236577.0], [5.3, 236577.0], [5.4, 236577.0], [5.5, 236577.0], [5.6, 236577.0], [5.7, 236577.0], [5.8, 236577.0], [5.9, 237162.0], [6.0, 237162.0], [6.1, 237162.0], [6.2, 237162.0], [6.3, 237162.0], [6.4, 237162.0], [6.5, 237162.0], [6.6, 237162.0], [6.7, 237541.0], [6.8, 237541.0], [6.9, 237541.0], [7.0, 237541.0], [7.1, 237541.0], [7.2, 237541.0], [7.3, 237541.0], [7.4, 237541.0], [7.5, 239707.0], [7.6, 239707.0], [7.7, 239707.0], [7.8, 239707.0], [7.9, 239707.0], [8.0, 239707.0], [8.1, 239707.0], [8.2, 239707.0], [8.3, 239707.0], [8.4, 241435.0], [8.5, 241435.0], [8.6, 241435.0], [8.7, 241435.0], [8.8, 241435.0], [8.9, 241435.0], [9.0, 241435.0], [9.1, 241435.0], [9.2, 241704.0], [9.3, 241704.0], [9.4, 241704.0], [9.5, 241704.0], [9.6, 241704.0], [9.7, 241704.0], [9.8, 241704.0], [9.9, 241704.0], [10.0, 242828.0], [10.1, 242828.0], [10.2, 242828.0], [10.3, 242828.0], [10.4, 242828.0], [10.5, 242828.0], [10.6, 242828.0], [10.7, 242828.0], [10.8, 242828.0], [10.9, 243313.0], [11.0, 243313.0], [11.1, 243313.0], [11.2, 243313.0], [11.3, 243313.0], [11.4, 243313.0], [11.5, 243313.0], [11.6, 243313.0], [11.7, 243510.0], [11.8, 243510.0], [11.9, 243510.0], [12.0, 243510.0], [12.1, 243510.0], [12.2, 243510.0], [12.3, 243510.0], [12.4, 243510.0], [12.5, 243510.0], [12.6, 243605.0], [12.7, 243605.0], [12.8, 243605.0], [12.9, 243605.0], [13.0, 243605.0], [13.1, 243605.0], [13.2, 243605.0], [13.3, 243605.0], [13.4, 243691.0], [13.5, 243691.0], [13.6, 243691.0], [13.7, 243691.0], [13.8, 243691.0], [13.9, 243691.0], [14.0, 243691.0], [14.1, 243691.0], [14.2, 244016.0], [14.3, 244016.0], [14.4, 244016.0], [14.5, 244016.0], [14.6, 244016.0], [14.7, 244016.0], [14.8, 244016.0], [14.9, 244016.0], [15.0, 244016.0], [15.1, 244069.0], [15.2, 244069.0], [15.3, 244069.0], [15.4, 244069.0], [15.5, 244069.0], [15.6, 244069.0], [15.7, 244069.0], [15.8, 244069.0], [15.9, 244180.0], [16.0, 244180.0], [16.1, 244180.0], [16.2, 244180.0], [16.3, 244180.0], [16.4, 244180.0], [16.5, 244180.0], [16.6, 244180.0], [16.7, 244182.0], [16.8, 244182.0], [16.9, 244182.0], [17.0, 244182.0], [17.1, 244182.0], [17.2, 244182.0], [17.3, 244182.0], [17.4, 244182.0], [17.5, 244182.0], [17.6, 244252.0], [17.7, 244252.0], [17.8, 244252.0], [17.9, 244252.0], [18.0, 244252.0], [18.1, 244252.0], [18.2, 244252.0], [18.3, 244252.0], [18.4, 244674.0], [18.5, 244674.0], [18.6, 244674.0], [18.7, 244674.0], [18.8, 244674.0], [18.9, 244674.0], [19.0, 244674.0], [19.1, 244674.0], [19.2, 244722.0], [19.3, 244722.0], [19.4, 244722.0], [19.5, 244722.0], [19.6, 244722.0], [19.7, 244722.0], [19.8, 244722.0], [19.9, 244722.0], [20.0, 244724.0], [20.1, 244724.0], [20.2, 244724.0], [20.3, 244724.0], [20.4, 244724.0], [20.5, 244724.0], [20.6, 244724.0], [20.7, 244724.0], [20.8, 244724.0], [20.9, 244888.0], [21.0, 244888.0], [21.1, 244888.0], [21.2, 244888.0], [21.3, 244888.0], [21.4, 244888.0], [21.5, 244888.0], [21.6, 244888.0], [21.7, 244930.0], [21.8, 244930.0], [21.9, 244930.0], [22.0, 244930.0], [22.1, 244930.0], [22.2, 244930.0], [22.3, 244930.0], [22.4, 244930.0], [22.5, 245054.0], [22.6, 245054.0], [22.7, 245054.0], [22.8, 245054.0], [22.9, 245054.0], [23.0, 245054.0], [23.1, 245054.0], [23.2, 245054.0], [23.3, 245054.0], [23.4, 245577.0], [23.5, 245577.0], [23.6, 245577.0], [23.7, 245577.0], [23.8, 245577.0], [23.9, 245577.0], [24.0, 245577.0], [24.1, 245577.0], [24.2, 245751.0], [24.3, 245751.0], [24.4, 245751.0], [24.5, 245751.0], [24.6, 245751.0], [24.7, 245751.0], [24.8, 245751.0], [24.9, 245751.0], [25.0, 246042.0], [25.1, 246042.0], [25.2, 246042.0], [25.3, 246042.0], [25.4, 246042.0], [25.5, 246042.0], [25.6, 246042.0], [25.7, 246042.0], [25.8, 246042.0], [25.9, 246048.0], [26.0, 246048.0], [26.1, 246048.0], [26.2, 246048.0], [26.3, 246048.0], [26.4, 246048.0], [26.5, 246048.0], [26.6, 246048.0], [26.7, 246078.0], [26.8, 246078.0], [26.9, 246078.0], [27.0, 246078.0], [27.1, 246078.0], [27.2, 246078.0], [27.3, 246078.0], [27.4, 246078.0], [27.5, 246196.0], [27.6, 246196.0], [27.7, 246196.0], [27.8, 246196.0], [27.9, 246196.0], [28.0, 246196.0], [28.1, 246196.0], [28.2, 246196.0], [28.3, 246196.0], [28.4, 246344.0], [28.5, 246344.0], [28.6, 246344.0], [28.7, 246344.0], [28.8, 246344.0], [28.9, 246344.0], [29.0, 246344.0], [29.1, 246344.0], [29.2, 246387.0], [29.3, 246387.0], [29.4, 246387.0], [29.5, 246387.0], [29.6, 246387.0], [29.7, 246387.0], [29.8, 246387.0], [29.9, 246387.0], [30.0, 246510.0], [30.1, 246510.0], [30.2, 246510.0], [30.3, 246510.0], [30.4, 246510.0], [30.5, 246510.0], [30.6, 246510.0], [30.7, 246510.0], [30.8, 246510.0], [30.9, 246570.0], [31.0, 246570.0], [31.1, 246570.0], [31.2, 246570.0], [31.3, 246570.0], [31.4, 246570.0], [31.5, 246570.0], [31.6, 246570.0], [31.7, 246658.0], [31.8, 246658.0], [31.9, 246658.0], [32.0, 246658.0], [32.1, 246658.0], [32.2, 246658.0], [32.3, 246658.0], [32.4, 246658.0], [32.5, 246698.0], [32.6, 246698.0], [32.7, 246698.0], [32.8, 246698.0], [32.9, 246698.0], [33.0, 246698.0], [33.1, 246698.0], [33.2, 246698.0], [33.3, 246698.0], [33.4, 246747.0], [33.5, 246747.0], [33.6, 246747.0], [33.7, 246747.0], [33.8, 246747.0], [33.9, 246747.0], [34.0, 246747.0], [34.1, 246747.0], [34.2, 247023.0], [34.3, 247023.0], [34.4, 247023.0], [34.5, 247023.0], [34.6, 247023.0], [34.7, 247023.0], [34.8, 247023.0], [34.9, 247023.0], [35.0, 247084.0], [35.1, 247084.0], [35.2, 247084.0], [35.3, 247084.0], [35.4, 247084.0], [35.5, 247084.0], [35.6, 247084.0], [35.7, 247084.0], [35.8, 247084.0], [35.9, 247181.0], [36.0, 247181.0], [36.1, 247181.0], [36.2, 247181.0], [36.3, 247181.0], [36.4, 247181.0], [36.5, 247181.0], [36.6, 247181.0], [36.7, 247218.0], [36.8, 247218.0], [36.9, 247218.0], [37.0, 247218.0], [37.1, 247218.0], [37.2, 247218.0], [37.3, 247218.0], [37.4, 247218.0], [37.5, 247267.0], [37.6, 247267.0], [37.7, 247267.0], [37.8, 247267.0], [37.9, 247267.0], [38.0, 247267.0], [38.1, 247267.0], [38.2, 247267.0], [38.3, 247267.0], [38.4, 247462.0], [38.5, 247462.0], [38.6, 247462.0], [38.7, 247462.0], [38.8, 247462.0], [38.9, 247462.0], [39.0, 247462.0], [39.1, 247462.0], [39.2, 247471.0], [39.3, 247471.0], [39.4, 247471.0], [39.5, 247471.0], [39.6, 247471.0], [39.7, 247471.0], [39.8, 247471.0], [39.9, 247471.0], [40.0, 247471.0], [40.1, 247494.0], [40.2, 247494.0], [40.3, 247494.0], [40.4, 247494.0], [40.5, 247494.0], [40.6, 247494.0], [40.7, 247494.0], [40.8, 247494.0], [40.9, 247517.0], [41.0, 247517.0], [41.1, 247517.0], [41.2, 247517.0], [41.3, 247517.0], [41.4, 247517.0], [41.5, 247517.0], [41.6, 247517.0], [41.7, 247697.0], [41.8, 247697.0], [41.9, 247697.0], [42.0, 247697.0], [42.1, 247697.0], [42.2, 247697.0], [42.3, 247697.0], [42.4, 247697.0], [42.5, 247697.0], [42.6, 247706.0], [42.7, 247706.0], [42.8, 247706.0], [42.9, 247706.0], [43.0, 247706.0], [43.1, 247706.0], [43.2, 247706.0], [43.3, 247706.0], [43.4, 248032.0], [43.5, 248032.0], [43.6, 248032.0], [43.7, 248032.0], [43.8, 248032.0], [43.9, 248032.0], [44.0, 248032.0], [44.1, 248032.0], [44.2, 248806.0], [44.3, 248806.0], [44.4, 248806.0], [44.5, 248806.0], [44.6, 248806.0], [44.7, 248806.0], [44.8, 248806.0], [44.9, 248806.0], [45.0, 248806.0], [45.1, 248831.0], [45.2, 248831.0], [45.3, 248831.0], [45.4, 248831.0], [45.5, 248831.0], [45.6, 248831.0], [45.7, 248831.0], [45.8, 248831.0], [45.9, 248833.0], [46.0, 248833.0], [46.1, 248833.0], [46.2, 248833.0], [46.3, 248833.0], [46.4, 248833.0], [46.5, 248833.0], [46.6, 248833.0], [46.7, 249064.0], [46.8, 249064.0], [46.9, 249064.0], [47.0, 249064.0], [47.1, 249064.0], [47.2, 249064.0], [47.3, 249064.0], [47.4, 249064.0], [47.5, 249064.0], [47.6, 249078.0], [47.7, 249078.0], [47.8, 249078.0], [47.9, 249078.0], [48.0, 249078.0], [48.1, 249078.0], [48.2, 249078.0], [48.3, 249078.0], [48.4, 249314.0], [48.5, 249314.0], [48.6, 249314.0], [48.7, 249314.0], [48.8, 249314.0], [48.9, 249314.0], [49.0, 249314.0], [49.1, 249314.0], [49.2, 249462.0], [49.3, 249462.0], [49.4, 249462.0], [49.5, 249462.0], [49.6, 249462.0], [49.7, 249462.0], [49.8, 249462.0], [49.9, 249462.0], [50.0, 249462.0], [50.1, 249503.0], [50.2, 249503.0], [50.3, 249503.0], [50.4, 249503.0], [50.5, 249503.0], [50.6, 249503.0], [50.7, 249503.0], [50.8, 249503.0], [50.9, 249535.0], [51.0, 249535.0], [51.1, 249535.0], [51.2, 249535.0], [51.3, 249535.0], [51.4, 249535.0], [51.5, 249535.0], [51.6, 249535.0], [51.7, 249626.0], [51.8, 249626.0], [51.9, 249626.0], [52.0, 249626.0], [52.1, 249626.0], [52.2, 249626.0], [52.3, 249626.0], [52.4, 249626.0], [52.5, 249626.0], [52.6, 249657.0], [52.7, 249657.0], [52.8, 249657.0], [52.9, 249657.0], [53.0, 249657.0], [53.1, 249657.0], [53.2, 249657.0], [53.3, 249657.0], [53.4, 249957.0], [53.5, 249957.0], [53.6, 249957.0], [53.7, 249957.0], [53.8, 249957.0], [53.9, 249957.0], [54.0, 249957.0], [54.1, 249957.0], [54.2, 250155.0], [54.3, 250155.0], [54.4, 250155.0], [54.5, 250155.0], [54.6, 250155.0], [54.7, 250155.0], [54.8, 250155.0], [54.9, 250155.0], [55.0, 250155.0], [55.1, 250222.0], [55.2, 250222.0], [55.3, 250222.0], [55.4, 250222.0], [55.5, 250222.0], [55.6, 250222.0], [55.7, 250222.0], [55.8, 250222.0], [55.9, 250224.0], [56.0, 250224.0], [56.1, 250224.0], [56.2, 250224.0], [56.3, 250224.0], [56.4, 250224.0], [56.5, 250224.0], [56.6, 250224.0], [56.7, 250229.0], [56.8, 250229.0], [56.9, 250229.0], [57.0, 250229.0], [57.1, 250229.0], [57.2, 250229.0], [57.3, 250229.0], [57.4, 250229.0], [57.5, 250229.0], [57.6, 250399.0], [57.7, 250399.0], [57.8, 250399.0], [57.9, 250399.0], [58.0, 250399.0], [58.1, 250399.0], [58.2, 250399.0], [58.3, 250399.0], [58.4, 250417.0], [58.5, 250417.0], [58.6, 250417.0], [58.7, 250417.0], [58.8, 250417.0], [58.9, 250417.0], [59.0, 250417.0], [59.1, 250417.0], [59.2, 250503.0], [59.3, 250503.0], [59.4, 250503.0], [59.5, 250503.0], [59.6, 250503.0], [59.7, 250503.0], [59.8, 250503.0], [59.9, 250503.0], [60.0, 250503.0], [60.1, 250635.0], [60.2, 250635.0], [60.3, 250635.0], [60.4, 250635.0], [60.5, 250635.0], [60.6, 250635.0], [60.7, 250635.0], [60.8, 250635.0], [60.9, 250735.0], [61.0, 250735.0], [61.1, 250735.0], [61.2, 250735.0], [61.3, 250735.0], [61.4, 250735.0], [61.5, 250735.0], [61.6, 250735.0], [61.7, 250806.0], [61.8, 250806.0], [61.9, 250806.0], [62.0, 250806.0], [62.1, 250806.0], [62.2, 250806.0], [62.3, 250806.0], [62.4, 250806.0], [62.5, 250806.0], [62.6, 250877.0], [62.7, 250877.0], [62.8, 250877.0], [62.9, 250877.0], [63.0, 250877.0], [63.1, 250877.0], [63.2, 250877.0], [63.3, 250877.0], [63.4, 250949.0], [63.5, 250949.0], [63.6, 250949.0], [63.7, 250949.0], [63.8, 250949.0], [63.9, 250949.0], [64.0, 250949.0], [64.1, 250949.0], [64.2, 250958.0], [64.3, 250958.0], [64.4, 250958.0], [64.5, 250958.0], [64.6, 250958.0], [64.7, 250958.0], [64.8, 250958.0], [64.9, 250958.0], [65.0, 250958.0], [65.1, 251245.0], [65.2, 251245.0], [65.3, 251245.0], [65.4, 251245.0], [65.5, 251245.0], [65.6, 251245.0], [65.7, 251245.0], [65.8, 251245.0], [65.9, 251318.0], [66.0, 251318.0], [66.1, 251318.0], [66.2, 251318.0], [66.3, 251318.0], [66.4, 251318.0], [66.5, 251318.0], [66.6, 251318.0], [66.7, 251355.0], [66.8, 251355.0], [66.9, 251355.0], [67.0, 251355.0], [67.1, 251355.0], [67.2, 251355.0], [67.3, 251355.0], [67.4, 251355.0], [67.5, 251355.0], [67.6, 251485.0], [67.7, 251485.0], [67.8, 251485.0], [67.9, 251485.0], [68.0, 251485.0], [68.1, 251485.0], [68.2, 251485.0], [68.3, 251485.0], [68.4, 251485.0], [68.5, 251485.0], [68.6, 251485.0], [68.7, 251485.0], [68.8, 251485.0], [68.9, 251485.0], [69.0, 251485.0], [69.1, 251485.0], [69.2, 251513.0], [69.3, 251513.0], [69.4, 251513.0], [69.5, 251513.0], [69.6, 251513.0], [69.7, 251513.0], [69.8, 251513.0], [69.9, 251513.0], [70.0, 251513.0], [70.1, 251542.0], [70.2, 251542.0], [70.3, 251542.0], [70.4, 251542.0], [70.5, 251542.0], [70.6, 251542.0], [70.7, 251542.0], [70.8, 251542.0], [70.9, 251662.0], [71.0, 251662.0], [71.1, 251662.0], [71.2, 251662.0], [71.3, 251662.0], [71.4, 251662.0], [71.5, 251662.0], [71.6, 251662.0], [71.7, 251742.0], [71.8, 251742.0], [71.9, 251742.0], [72.0, 251742.0], [72.1, 251742.0], [72.2, 251742.0], [72.3, 251742.0], [72.4, 251742.0], [72.5, 251742.0], [72.6, 252041.0], [72.7, 252041.0], [72.8, 252041.0], [72.9, 252041.0], [73.0, 252041.0], [73.1, 252041.0], [73.2, 252041.0], [73.3, 252041.0], [73.4, 252314.0], [73.5, 252314.0], [73.6, 252314.0], [73.7, 252314.0], [73.8, 252314.0], [73.9, 252314.0], [74.0, 252314.0], [74.1, 252314.0], [74.2, 252341.0], [74.3, 252341.0], [74.4, 252341.0], [74.5, 252341.0], [74.6, 252341.0], [74.7, 252341.0], [74.8, 252341.0], [74.9, 252341.0], [75.0, 252341.0], [75.1, 252354.0], [75.2, 252354.0], [75.3, 252354.0], [75.4, 252354.0], [75.5, 252354.0], [75.6, 252354.0], [75.7, 252354.0], [75.8, 252354.0], [75.9, 252474.0], [76.0, 252474.0], [76.1, 252474.0], [76.2, 252474.0], [76.3, 252474.0], [76.4, 252474.0], [76.5, 252474.0], [76.6, 252474.0], [76.7, 252553.0], [76.8, 252553.0], [76.9, 252553.0], [77.0, 252553.0], [77.1, 252553.0], [77.2, 252553.0], [77.3, 252553.0], [77.4, 252553.0], [77.5, 252553.0], [77.6, 252857.0], [77.7, 252857.0], [77.8, 252857.0], [77.9, 252857.0], [78.0, 252857.0], [78.1, 252857.0], [78.2, 252857.0], [78.3, 252857.0], [78.4, 253007.0], [78.5, 253007.0], [78.6, 253007.0], [78.7, 253007.0], [78.8, 253007.0], [78.9, 253007.0], [79.0, 253007.0], [79.1, 253007.0], [79.2, 253144.0], [79.3, 253144.0], [79.4, 253144.0], [79.5, 253144.0], [79.6, 253144.0], [79.7, 253144.0], [79.8, 253144.0], [79.9, 253144.0], [80.0, 253259.0], [80.1, 253259.0], [80.2, 253259.0], [80.3, 253259.0], [80.4, 253259.0], [80.5, 253259.0], [80.6, 253259.0], [80.7, 253259.0], [80.8, 253259.0], [80.9, 253576.0], [81.0, 253576.0], [81.1, 253576.0], [81.2, 253576.0], [81.3, 253576.0], [81.4, 253576.0], [81.5, 253576.0], [81.6, 253576.0], [81.7, 253700.0], [81.8, 253700.0], [81.9, 253700.0], [82.0, 253700.0], [82.1, 253700.0], [82.2, 253700.0], [82.3, 253700.0], [82.4, 253700.0], [82.5, 253820.0], [82.6, 253820.0], [82.7, 253820.0], [82.8, 253820.0], [82.9, 253820.0], [83.0, 253820.0], [83.1, 253820.0], [83.2, 253820.0], [83.3, 253820.0], [83.4, 253877.0], [83.5, 253877.0], [83.6, 253877.0], [83.7, 253877.0], [83.8, 253877.0], [83.9, 253877.0], [84.0, 253877.0], [84.1, 253877.0], [84.2, 253929.0], [84.3, 253929.0], [84.4, 253929.0], [84.5, 253929.0], [84.6, 253929.0], [84.7, 253929.0], [84.8, 253929.0], [84.9, 253929.0], [85.0, 254057.0], [85.1, 254057.0], [85.2, 254057.0], [85.3, 254057.0], [85.4, 254057.0], [85.5, 254057.0], [85.6, 254057.0], [85.7, 254057.0], [85.8, 254057.0], [85.9, 254518.0], [86.0, 254518.0], [86.1, 254518.0], [86.2, 254518.0], [86.3, 254518.0], [86.4, 254518.0], [86.5, 254518.0], [86.6, 254518.0], [86.7, 254559.0], [86.8, 254559.0], [86.9, 254559.0], [87.0, 254559.0], [87.1, 254559.0], [87.2, 254559.0], [87.3, 254559.0], [87.4, 254559.0], [87.5, 254860.0], [87.6, 254860.0], [87.7, 254860.0], [87.8, 254860.0], [87.9, 254860.0], [88.0, 254860.0], [88.1, 254860.0], [88.2, 254860.0], [88.3, 254860.0], [88.4, 254955.0], [88.5, 254955.0], [88.6, 254955.0], [88.7, 254955.0], [88.8, 254955.0], [88.9, 254955.0], [89.0, 254955.0], [89.1, 254955.0], [89.2, 255069.0], [89.3, 255069.0], [89.4, 255069.0], [89.5, 255069.0], [89.6, 255069.0], [89.7, 255069.0], [89.8, 255069.0], [89.9, 255069.0], [90.0, 255762.0], [90.1, 255762.0], [90.2, 255762.0], [90.3, 255762.0], [90.4, 255762.0], [90.5, 255762.0], [90.6, 255762.0], [90.7, 255762.0], [90.8, 255762.0], [90.9, 256001.0], [91.0, 256001.0], [91.1, 256001.0], [91.2, 256001.0], [91.3, 256001.0], [91.4, 256001.0], [91.5, 256001.0], [91.6, 256001.0], [91.7, 256538.0], [91.8, 256538.0], [91.9, 256538.0], [92.0, 256538.0], [92.1, 256538.0], [92.2, 256538.0], [92.3, 256538.0], [92.4, 256538.0], [92.5, 256611.0], [92.6, 256611.0], [92.7, 256611.0], [92.8, 256611.0], [92.9, 256611.0], [93.0, 256611.0], [93.1, 256611.0], [93.2, 256611.0], [93.3, 256611.0], [93.4, 256956.0], [93.5, 256956.0], [93.6, 256956.0], [93.7, 256956.0], [93.8, 256956.0], [93.9, 256956.0], [94.0, 256956.0], [94.1, 256956.0], [94.2, 257059.0], [94.3, 257059.0], [94.4, 257059.0], [94.5, 257059.0], [94.6, 257059.0], [94.7, 257059.0], [94.8, 257059.0], [94.9, 257059.0], [95.0, 257118.0], [95.1, 257118.0], [95.2, 257118.0], [95.3, 257118.0], [95.4, 257118.0], [95.5, 257118.0], [95.6, 257118.0], [95.7, 257118.0], [95.8, 257118.0], [95.9, 257670.0], [96.0, 257670.0], [96.1, 257670.0], [96.2, 257670.0], [96.3, 257670.0], [96.4, 257670.0], [96.5, 257670.0], [96.6, 257670.0], [96.7, 258176.0], [96.8, 258176.0], [96.9, 258176.0], [97.0, 258176.0], [97.1, 258176.0], [97.2, 258176.0], [97.3, 258176.0], [97.4, 258176.0], [97.5, 258442.0], [97.6, 258442.0], [97.7, 258442.0], [97.8, 258442.0], [97.9, 258442.0], [98.0, 258442.0], [98.1, 258442.0], [98.2, 258442.0], [98.3, 258442.0], [98.4, 258921.0], [98.5, 258921.0], [98.6, 258921.0], [98.7, 258921.0], [98.8, 258921.0], [98.9, 258921.0], [99.0, 258921.0], [99.1, 258921.0], [99.2, 259305.0], [99.3, 259305.0], [99.4, 259305.0], [99.5, 259305.0], [99.6, 259305.0], [99.7, 259305.0], [99.8, 259305.0], [99.9, 259305.0]], "isOverall": false, "label": "HTTP Request", "isController": false}], "supportsControllersDiscrimination": true, "maxX": 100.0, "title": "Response Time Percentiles"}},
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
        data: {"result": {"minY": 1.0, "minX": 228100.0, "maxY": 3.0, "series": [{"data": [[232000.0, 1.0], [234400.0, 1.0], [234800.0, 1.0], [235600.0, 1.0], [243600.0, 2.0], [244000.0, 2.0], [242800.0, 1.0], [244800.0, 1.0], [247600.0, 1.0], [246000.0, 3.0], [248000.0, 1.0], [247200.0, 2.0], [250800.0, 2.0], [250400.0, 1.0], [253200.0, 1.0], [252800.0, 1.0], [252000.0, 1.0], [252400.0, 1.0], [248800.0, 3.0], [249600.0, 2.0], [251200.0, 1.0], [251600.0, 1.0], [257600.0, 1.0], [258400.0, 1.0], [256000.0, 1.0], [254800.0, 1.0], [254000.0, 1.0], [228100.0, 1.0], [236500.0, 1.0], [239700.0, 1.0], [241700.0, 1.0], [244100.0, 2.0], [243300.0, 1.0], [245700.0, 1.0], [244900.0, 1.0], [253700.0, 1.0], [246500.0, 2.0], [246100.0, 1.0], [251700.0, 1.0], [252500.0, 1.0], [247700.0, 1.0], [249300.0, 1.0], [251300.0, 2.0], [250100.0, 1.0], [250900.0, 2.0], [250500.0, 1.0], [254500.0, 2.0], [259300.0, 1.0], [255700.0, 1.0], [258900.0, 1.0], [258100.0, 1.0], [254900.0, 1.0], [256500.0, 1.0], [256900.0, 1.0], [236200.0, 1.0], [241400.0, 1.0], [244200.0, 1.0], [245000.0, 1.0], [244600.0, 1.0], [247000.0, 2.0], [246600.0, 2.0], [247400.0, 3.0], [251400.0, 2.0], [253800.0, 2.0], [249400.0, 1.0], [249000.0, 2.0], [250200.0, 3.0], [250600.0, 1.0], [253000.0, 1.0], [257000.0, 1.0], [255000.0, 1.0], [256600.0, 1.0], [237100.0, 1.0], [237500.0, 1.0], [243500.0, 1.0], [244700.0, 2.0], [245500.0, 1.0], [252300.0, 3.0], [246300.0, 2.0], [246700.0, 1.0], [247500.0, 1.0], [247100.0, 1.0], [249500.0, 2.0], [249900.0, 1.0], [250300.0, 1.0], [251500.0, 2.0], [250700.0, 1.0], [253100.0, 1.0], [253500.0, 1.0], [253900.0, 1.0], [257100.0, 1.0]], "isOverall": false, "label": "HTTP Request", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 100, "maxX": 259300.0, "title": "Response Time Distribution"}},
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
        data: {"result": {"minY": 30.550000000000026, "minX": 1.52074812E12, "maxY": 60.0, "series": [{"data": [[1.52074812E12, 60.0], [1.52074842E12, 30.550000000000026], [1.52074818E12, 60.0]], "isOverall": false, "label": "Thread Group", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.52074842E12, "title": "Active Threads Over Time"}},
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
        fixTimeStamps(infos.data.result.series, -28800000);
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
        data: {"result": {"minY": 244674.0, "minX": 1.0, "maxY": 259305.0, "series": [{"data": [[3.0, 249327.5], [4.0, 250503.0], [5.0, 250735.0], [6.0, 247181.0], [7.0, 245751.0], [9.0, 248858.0], [10.0, 248833.0], [11.0, 250635.0], [12.0, 250229.0], [13.0, 252341.0], [14.0, 250958.0], [15.0, 251318.0], [16.0, 254057.0], [17.0, 244674.0], [18.0, 251662.0], [19.0, 253007.0], [20.0, 250155.0], [21.0, 256611.0], [22.0, 249078.0], [23.0, 254860.0], [24.0, 250417.0], [25.0, 251485.0], [26.0, 252474.0], [27.0, 254518.0], [28.0, 253576.0], [29.0, 256001.0], [30.0, 250224.0], [31.0, 253700.0], [33.0, 249064.0], [32.0, 251542.0], [35.0, 249462.0], [34.0, 253929.0], [37.0, 250806.0], [36.0, 256956.0], [39.0, 258442.0], [38.0, 251355.0], [41.0, 256538.0], [40.0, 253144.0], [43.0, 253877.0], [42.0, 251513.0], [45.0, 249314.0], [44.0, 250399.0], [46.0, 255069.0], [49.0, 258176.0], [48.0, 253654.5], [51.0, 249957.0], [50.0, 258921.0], [53.0, 257118.0], [52.0, 253820.0], [55.0, 255762.0], [54.0, 257670.0], [57.0, 259305.0], [56.0, 257059.0], [59.0, 254559.0], [58.0, 252857.0], [60.0, 245025.91803278687], [1.0, 244930.0]], "isOverall": false, "label": "HTTP Request", "isController": false}, {"data": [[45.274999999999984, 248639.89999999997]], "isOverall": false, "label": "HTTP Request-Aggregated", "isController": false}], "supportsControllersDiscrimination": true, "maxX": 60.0, "title": "Time VS Threads"}},
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
        data : {"result": {"minY": 2.1, "minX": 1.52074812E12, "maxY": 43293.0, "series": [{"data": [[1.52074812E12, 721.55], [1.52074842E12, 43293.0], [1.52074818E12, 42571.45]], "isOverall": false, "label": "Bytes received per second", "isController": false}, {"data": [[1.52074812E12, 2.1], [1.52074842E12, 126.0], [1.52074818E12, 123.9]], "isOverall": false, "label": "Bytes sent per second", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.52074842E12, "title": "Bytes Throughput Over Time"}},
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
        fixTimeStamps(infos.data.result.series, -28800000);
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
        data: {"result": {"minY": 228124.0, "minX": 1.52074812E12, "maxY": 252331.06666666662, "series": [{"data": [[1.52074812E12, 228124.0], [1.52074842E12, 252331.06666666662], [1.52074818E12, 245233.89830508476]], "isOverall": false, "label": "HTTP Request", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.52074842E12, "title": "Response Time Over Time"}},
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
        fixTimeStamps(infos.data.result.series, -28800000);
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
        data: {"result": {"minY": 26025.0, "minX": 1.52074812E12, "maxY": 43221.05, "series": [{"data": [[1.52074812E12, 26025.0], [1.52074842E12, 43221.05], [1.52074818E12, 40473.03389830508]], "isOverall": false, "label": "HTTP Request", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.52074842E12, "title": "Latencies Over Time"}},
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
        fixTimeStamps(infos.data.result.series, -28800000);
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
        data: {"result": {"minY": 7.733333333333334, "minX": 1.52074812E12, "maxY": 9.0, "series": [{"data": [[1.52074812E12, 9.0], [1.52074842E12, 7.733333333333334], [1.52074818E12, 8.677966101694913]], "isOverall": false, "label": "HTTP Request", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.52074842E12, "title": "Connect Time Over Time"}},
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
        fixTimeStamps(infos.data.result.series, -28800000);
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
        data: {"result": {"minY": 228124.0, "minX": 1.52074812E12, "maxY": 259305.0, "series": [{"data": [[1.52074812E12, 228124.0], [1.52074842E12, 259305.0], [1.52074818E12, 253259.0]], "isOverall": false, "label": "Max", "isController": false}, {"data": [[1.52074812E12, 228124.0], [1.52074842E12, 244674.0], [1.52074818E12, 232003.0]], "isOverall": false, "label": "Min", "isController": false}, {"data": [[1.52074812E12, 228124.0], [1.52074842E12, 255692.7], [1.52074818E12, 251461.0]], "isOverall": false, "label": "90th percentile", "isController": false}, {"data": [[1.52074812E12, 228124.0], [1.52074842E12, 259224.36], [1.52074818E12, 253259.0]], "isOverall": false, "label": "99th percentile", "isController": false}, {"data": [[1.52074812E12, 228124.0], [1.52074842E12, 257115.05], [1.52074818E12, 252300.35]], "isOverall": false, "label": "95th percentile", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.52074842E12, "title": "Response Time Percentiles Over Time (successful requests only)"}},
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
        fixTimeStamps(infos.data.result.series, -28800000);
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
    data: {"result": {"minY": 246137.0, "minX": 0.0, "maxY": 251602.0, "series": [{"data": [[0.0, 246137.0], [1.0, 251602.0]], "isOverall": false, "label": "Successes", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.0, "title": "Response Time Vs Request"}},
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
    data: {"result": {"minY": 41965.5, "minX": 0.0, "maxY": 43193.5, "series": [{"data": [[0.0, 41965.5], [1.0, 43193.5]], "isOverall": false, "label": "Successes", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.0, "title": "Latencies Vs Request"}},
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
        data: {"result": {"minY": 0.016666666666666666, "minX": 1.52074794E12, "maxY": 1.0, "series": [{"data": [[1.52074812E12, 0.016666666666666666], [1.52074794E12, 1.0], [1.52074818E12, 0.9833333333333333]], "isOverall": false, "label": "hitsPerSecond", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.52074818E12, "title": "Hits Per Second"}},
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
        fixTimeStamps(infos.data.result.series, -28800000);
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
        data: {"result": {"minY": 0.016666666666666666, "minX": 1.52074812E12, "maxY": 1.0, "series": [{"data": [[1.52074812E12, 0.016666666666666666], [1.52074842E12, 1.0], [1.52074818E12, 0.9833333333333333]], "isOverall": false, "label": "200", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.52074842E12, "title": "Codes Per Second"}},
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
        fixTimeStamps(infos.data.result.series, -28800000);
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
        data: {"result": {"minY": 0.016666666666666666, "minX": 1.52074812E12, "maxY": 1.0, "series": [{"data": [[1.52074812E12, 0.016666666666666666], [1.52074842E12, 1.0], [1.52074818E12, 0.9833333333333333]], "isOverall": false, "label": "HTTP Request-success", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.52074842E12, "title": "Transactions Per Second"}},
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
        fixTimeStamps(infos.data.result.series, -28800000);
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
