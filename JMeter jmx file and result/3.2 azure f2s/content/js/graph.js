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
        data: {"result": {"minY": 194908.0, "minX": 0.0, "maxY": 225336.0, "series": [{"data": [[0.0, 194908.0], [0.1, 194908.0], [0.2, 194908.0], [0.3, 194908.0], [0.4, 194908.0], [0.5, 194908.0], [0.6, 194908.0], [0.7, 194908.0], [0.8, 194908.0], [0.9, 194969.0], [1.0, 194969.0], [1.1, 194969.0], [1.2, 194969.0], [1.3, 194969.0], [1.4, 194969.0], [1.5, 194969.0], [1.6, 194969.0], [1.7, 196659.0], [1.8, 196659.0], [1.9, 196659.0], [2.0, 196659.0], [2.1, 196659.0], [2.2, 196659.0], [2.3, 196659.0], [2.4, 196659.0], [2.5, 197331.0], [2.6, 197331.0], [2.7, 197331.0], [2.8, 197331.0], [2.9, 197331.0], [3.0, 197331.0], [3.1, 197331.0], [3.2, 197331.0], [3.3, 197331.0], [3.4, 197982.0], [3.5, 197982.0], [3.6, 197982.0], [3.7, 197982.0], [3.8, 197982.0], [3.9, 197982.0], [4.0, 197982.0], [4.1, 197982.0], [4.2, 198801.0], [4.3, 198801.0], [4.4, 198801.0], [4.5, 198801.0], [4.6, 198801.0], [4.7, 198801.0], [4.8, 198801.0], [4.9, 198801.0], [5.0, 199712.0], [5.1, 199712.0], [5.2, 199712.0], [5.3, 199712.0], [5.4, 199712.0], [5.5, 199712.0], [5.6, 199712.0], [5.7, 199712.0], [5.8, 199712.0], [5.9, 199755.0], [6.0, 199755.0], [6.1, 199755.0], [6.2, 199755.0], [6.3, 199755.0], [6.4, 199755.0], [6.5, 199755.0], [6.6, 199755.0], [6.7, 200032.0], [6.8, 200032.0], [6.9, 200032.0], [7.0, 200032.0], [7.1, 200032.0], [7.2, 200032.0], [7.3, 200032.0], [7.4, 200032.0], [7.5, 200353.0], [7.6, 200353.0], [7.7, 200353.0], [7.8, 200353.0], [7.9, 200353.0], [8.0, 200353.0], [8.1, 200353.0], [8.2, 200353.0], [8.3, 200353.0], [8.4, 200831.0], [8.5, 200831.0], [8.6, 200831.0], [8.7, 200831.0], [8.8, 200831.0], [8.9, 200831.0], [9.0, 200831.0], [9.1, 200831.0], [9.2, 201182.0], [9.3, 201182.0], [9.4, 201182.0], [9.5, 201182.0], [9.6, 201182.0], [9.7, 201182.0], [9.8, 201182.0], [9.9, 201182.0], [10.0, 201383.0], [10.1, 201383.0], [10.2, 201383.0], [10.3, 201383.0], [10.4, 201383.0], [10.5, 201383.0], [10.6, 201383.0], [10.7, 201383.0], [10.8, 201383.0], [10.9, 201471.0], [11.0, 201471.0], [11.1, 201471.0], [11.2, 201471.0], [11.3, 201471.0], [11.4, 201471.0], [11.5, 201471.0], [11.6, 201471.0], [11.7, 201624.0], [11.8, 201624.0], [11.9, 201624.0], [12.0, 201624.0], [12.1, 201624.0], [12.2, 201624.0], [12.3, 201624.0], [12.4, 201624.0], [12.5, 201624.0], [12.6, 203004.0], [12.7, 203004.0], [12.8, 203004.0], [12.9, 203004.0], [13.0, 203004.0], [13.1, 203004.0], [13.2, 203004.0], [13.3, 203004.0], [13.4, 203171.0], [13.5, 203171.0], [13.6, 203171.0], [13.7, 203171.0], [13.8, 203171.0], [13.9, 203171.0], [14.0, 203171.0], [14.1, 203171.0], [14.2, 203242.0], [14.3, 203242.0], [14.4, 203242.0], [14.5, 203242.0], [14.6, 203242.0], [14.7, 203242.0], [14.8, 203242.0], [14.9, 203242.0], [15.0, 203242.0], [15.1, 203712.0], [15.2, 203712.0], [15.3, 203712.0], [15.4, 203712.0], [15.5, 203712.0], [15.6, 203712.0], [15.7, 203712.0], [15.8, 203712.0], [15.9, 204043.0], [16.0, 204043.0], [16.1, 204043.0], [16.2, 204043.0], [16.3, 204043.0], [16.4, 204043.0], [16.5, 204043.0], [16.6, 204043.0], [16.7, 204134.0], [16.8, 204134.0], [16.9, 204134.0], [17.0, 204134.0], [17.1, 204134.0], [17.2, 204134.0], [17.3, 204134.0], [17.4, 204134.0], [17.5, 204134.0], [17.6, 204146.0], [17.7, 204146.0], [17.8, 204146.0], [17.9, 204146.0], [18.0, 204146.0], [18.1, 204146.0], [18.2, 204146.0], [18.3, 204146.0], [18.4, 204393.0], [18.5, 204393.0], [18.6, 204393.0], [18.7, 204393.0], [18.8, 204393.0], [18.9, 204393.0], [19.0, 204393.0], [19.1, 204393.0], [19.2, 204676.0], [19.3, 204676.0], [19.4, 204676.0], [19.5, 204676.0], [19.6, 204676.0], [19.7, 204676.0], [19.8, 204676.0], [19.9, 204676.0], [20.0, 205298.0], [20.1, 205298.0], [20.2, 205298.0], [20.3, 205298.0], [20.4, 205298.0], [20.5, 205298.0], [20.6, 205298.0], [20.7, 205298.0], [20.8, 205298.0], [20.9, 205387.0], [21.0, 205387.0], [21.1, 205387.0], [21.2, 205387.0], [21.3, 205387.0], [21.4, 205387.0], [21.5, 205387.0], [21.6, 205387.0], [21.7, 205400.0], [21.8, 205400.0], [21.9, 205400.0], [22.0, 205400.0], [22.1, 205400.0], [22.2, 205400.0], [22.3, 205400.0], [22.4, 205400.0], [22.5, 205498.0], [22.6, 205498.0], [22.7, 205498.0], [22.8, 205498.0], [22.9, 205498.0], [23.0, 205498.0], [23.1, 205498.0], [23.2, 205498.0], [23.3, 205498.0], [23.4, 205566.0], [23.5, 205566.0], [23.6, 205566.0], [23.7, 205566.0], [23.8, 205566.0], [23.9, 205566.0], [24.0, 205566.0], [24.1, 205566.0], [24.2, 205743.0], [24.3, 205743.0], [24.4, 205743.0], [24.5, 205743.0], [24.6, 205743.0], [24.7, 205743.0], [24.8, 205743.0], [24.9, 205743.0], [25.0, 205922.0], [25.1, 205922.0], [25.2, 205922.0], [25.3, 205922.0], [25.4, 205922.0], [25.5, 205922.0], [25.6, 205922.0], [25.7, 205922.0], [25.8, 205922.0], [25.9, 206048.0], [26.0, 206048.0], [26.1, 206048.0], [26.2, 206048.0], [26.3, 206048.0], [26.4, 206048.0], [26.5, 206048.0], [26.6, 206048.0], [26.7, 206215.0], [26.8, 206215.0], [26.9, 206215.0], [27.0, 206215.0], [27.1, 206215.0], [27.2, 206215.0], [27.3, 206215.0], [27.4, 206215.0], [27.5, 206519.0], [27.6, 206519.0], [27.7, 206519.0], [27.8, 206519.0], [27.9, 206519.0], [28.0, 206519.0], [28.1, 206519.0], [28.2, 206519.0], [28.3, 206519.0], [28.4, 206585.0], [28.5, 206585.0], [28.6, 206585.0], [28.7, 206585.0], [28.8, 206585.0], [28.9, 206585.0], [29.0, 206585.0], [29.1, 206585.0], [29.2, 206735.0], [29.3, 206735.0], [29.4, 206735.0], [29.5, 206735.0], [29.6, 206735.0], [29.7, 206735.0], [29.8, 206735.0], [29.9, 206735.0], [30.0, 206883.0], [30.1, 206883.0], [30.2, 206883.0], [30.3, 206883.0], [30.4, 206883.0], [30.5, 206883.0], [30.6, 206883.0], [30.7, 206883.0], [30.8, 206883.0], [30.9, 206909.0], [31.0, 206909.0], [31.1, 206909.0], [31.2, 206909.0], [31.3, 206909.0], [31.4, 206909.0], [31.5, 206909.0], [31.6, 206909.0], [31.7, 206918.0], [31.8, 206918.0], [31.9, 206918.0], [32.0, 206918.0], [32.1, 206918.0], [32.2, 206918.0], [32.3, 206918.0], [32.4, 206918.0], [32.5, 207093.0], [32.6, 207093.0], [32.7, 207093.0], [32.8, 207093.0], [32.9, 207093.0], [33.0, 207093.0], [33.1, 207093.0], [33.2, 207093.0], [33.3, 207093.0], [33.4, 207132.0], [33.5, 207132.0], [33.6, 207132.0], [33.7, 207132.0], [33.8, 207132.0], [33.9, 207132.0], [34.0, 207132.0], [34.1, 207132.0], [34.2, 207227.0], [34.3, 207227.0], [34.4, 207227.0], [34.5, 207227.0], [34.6, 207227.0], [34.7, 207227.0], [34.8, 207227.0], [34.9, 207227.0], [35.0, 207438.0], [35.1, 207438.0], [35.2, 207438.0], [35.3, 207438.0], [35.4, 207438.0], [35.5, 207438.0], [35.6, 207438.0], [35.7, 207438.0], [35.8, 207438.0], [35.9, 207484.0], [36.0, 207484.0], [36.1, 207484.0], [36.2, 207484.0], [36.3, 207484.0], [36.4, 207484.0], [36.5, 207484.0], [36.6, 207484.0], [36.7, 207656.0], [36.8, 207656.0], [36.9, 207656.0], [37.0, 207656.0], [37.1, 207656.0], [37.2, 207656.0], [37.3, 207656.0], [37.4, 207656.0], [37.5, 208092.0], [37.6, 208092.0], [37.7, 208092.0], [37.8, 208092.0], [37.9, 208092.0], [38.0, 208092.0], [38.1, 208092.0], [38.2, 208092.0], [38.3, 208092.0], [38.4, 208181.0], [38.5, 208181.0], [38.6, 208181.0], [38.7, 208181.0], [38.8, 208181.0], [38.9, 208181.0], [39.0, 208181.0], [39.1, 208181.0], [39.2, 208279.0], [39.3, 208279.0], [39.4, 208279.0], [39.5, 208279.0], [39.6, 208279.0], [39.7, 208279.0], [39.8, 208279.0], [39.9, 208279.0], [40.0, 208279.0], [40.1, 208349.0], [40.2, 208349.0], [40.3, 208349.0], [40.4, 208349.0], [40.5, 208349.0], [40.6, 208349.0], [40.7, 208349.0], [40.8, 208349.0], [40.9, 208416.0], [41.0, 208416.0], [41.1, 208416.0], [41.2, 208416.0], [41.3, 208416.0], [41.4, 208416.0], [41.5, 208416.0], [41.6, 208416.0], [41.7, 208549.0], [41.8, 208549.0], [41.9, 208549.0], [42.0, 208549.0], [42.1, 208549.0], [42.2, 208549.0], [42.3, 208549.0], [42.4, 208549.0], [42.5, 208549.0], [42.6, 208574.0], [42.7, 208574.0], [42.8, 208574.0], [42.9, 208574.0], [43.0, 208574.0], [43.1, 208574.0], [43.2, 208574.0], [43.3, 208574.0], [43.4, 208958.0], [43.5, 208958.0], [43.6, 208958.0], [43.7, 208958.0], [43.8, 208958.0], [43.9, 208958.0], [44.0, 208958.0], [44.1, 208958.0], [44.2, 209031.0], [44.3, 209031.0], [44.4, 209031.0], [44.5, 209031.0], [44.6, 209031.0], [44.7, 209031.0], [44.8, 209031.0], [44.9, 209031.0], [45.0, 209031.0], [45.1, 209755.0], [45.2, 209755.0], [45.3, 209755.0], [45.4, 209755.0], [45.5, 209755.0], [45.6, 209755.0], [45.7, 209755.0], [45.8, 209755.0], [45.9, 210516.0], [46.0, 210516.0], [46.1, 210516.0], [46.2, 210516.0], [46.3, 210516.0], [46.4, 210516.0], [46.5, 210516.0], [46.6, 210516.0], [46.7, 210671.0], [46.8, 210671.0], [46.9, 210671.0], [47.0, 210671.0], [47.1, 210671.0], [47.2, 210671.0], [47.3, 210671.0], [47.4, 210671.0], [47.5, 210671.0], [47.6, 210751.0], [47.7, 210751.0], [47.8, 210751.0], [47.9, 210751.0], [48.0, 210751.0], [48.1, 210751.0], [48.2, 210751.0], [48.3, 210751.0], [48.4, 210841.0], [48.5, 210841.0], [48.6, 210841.0], [48.7, 210841.0], [48.8, 210841.0], [48.9, 210841.0], [49.0, 210841.0], [49.1, 210841.0], [49.2, 210844.0], [49.3, 210844.0], [49.4, 210844.0], [49.5, 210844.0], [49.6, 210844.0], [49.7, 210844.0], [49.8, 210844.0], [49.9, 210844.0], [50.0, 210844.0], [50.1, 210968.0], [50.2, 210968.0], [50.3, 210968.0], [50.4, 210968.0], [50.5, 210968.0], [50.6, 210968.0], [50.7, 210968.0], [50.8, 210968.0], [50.9, 211197.0], [51.0, 211197.0], [51.1, 211197.0], [51.2, 211197.0], [51.3, 211197.0], [51.4, 211197.0], [51.5, 211197.0], [51.6, 211197.0], [51.7, 211275.0], [51.8, 211275.0], [51.9, 211275.0], [52.0, 211275.0], [52.1, 211275.0], [52.2, 211275.0], [52.3, 211275.0], [52.4, 211275.0], [52.5, 211275.0], [52.6, 211525.0], [52.7, 211525.0], [52.8, 211525.0], [52.9, 211525.0], [53.0, 211525.0], [53.1, 211525.0], [53.2, 211525.0], [53.3, 211525.0], [53.4, 212203.0], [53.5, 212203.0], [53.6, 212203.0], [53.7, 212203.0], [53.8, 212203.0], [53.9, 212203.0], [54.0, 212203.0], [54.1, 212203.0], [54.2, 212476.0], [54.3, 212476.0], [54.4, 212476.0], [54.5, 212476.0], [54.6, 212476.0], [54.7, 212476.0], [54.8, 212476.0], [54.9, 212476.0], [55.0, 212476.0], [55.1, 212521.0], [55.2, 212521.0], [55.3, 212521.0], [55.4, 212521.0], [55.5, 212521.0], [55.6, 212521.0], [55.7, 212521.0], [55.8, 212521.0], [55.9, 212771.0], [56.0, 212771.0], [56.1, 212771.0], [56.2, 212771.0], [56.3, 212771.0], [56.4, 212771.0], [56.5, 212771.0], [56.6, 212771.0], [56.7, 212961.0], [56.8, 212961.0], [56.9, 212961.0], [57.0, 212961.0], [57.1, 212961.0], [57.2, 212961.0], [57.3, 212961.0], [57.4, 212961.0], [57.5, 212961.0], [57.6, 213173.0], [57.7, 213173.0], [57.8, 213173.0], [57.9, 213173.0], [58.0, 213173.0], [58.1, 213173.0], [58.2, 213173.0], [58.3, 213173.0], [58.4, 213192.0], [58.5, 213192.0], [58.6, 213192.0], [58.7, 213192.0], [58.8, 213192.0], [58.9, 213192.0], [59.0, 213192.0], [59.1, 213192.0], [59.2, 213475.0], [59.3, 213475.0], [59.4, 213475.0], [59.5, 213475.0], [59.6, 213475.0], [59.7, 213475.0], [59.8, 213475.0], [59.9, 213475.0], [60.0, 213475.0], [60.1, 213566.0], [60.2, 213566.0], [60.3, 213566.0], [60.4, 213566.0], [60.5, 213566.0], [60.6, 213566.0], [60.7, 213566.0], [60.8, 213566.0], [60.9, 213709.0], [61.0, 213709.0], [61.1, 213709.0], [61.2, 213709.0], [61.3, 213709.0], [61.4, 213709.0], [61.5, 213709.0], [61.6, 213709.0], [61.7, 213755.0], [61.8, 213755.0], [61.9, 213755.0], [62.0, 213755.0], [62.1, 213755.0], [62.2, 213755.0], [62.3, 213755.0], [62.4, 213755.0], [62.5, 213755.0], [62.6, 213786.0], [62.7, 213786.0], [62.8, 213786.0], [62.9, 213786.0], [63.0, 213786.0], [63.1, 213786.0], [63.2, 213786.0], [63.3, 213786.0], [63.4, 213904.0], [63.5, 213904.0], [63.6, 213904.0], [63.7, 213904.0], [63.8, 213904.0], [63.9, 213904.0], [64.0, 213904.0], [64.1, 213904.0], [64.2, 213989.0], [64.3, 213989.0], [64.4, 213989.0], [64.5, 213989.0], [64.6, 213989.0], [64.7, 213989.0], [64.8, 213989.0], [64.9, 213989.0], [65.0, 213989.0], [65.1, 214020.0], [65.2, 214020.0], [65.3, 214020.0], [65.4, 214020.0], [65.5, 214020.0], [65.6, 214020.0], [65.7, 214020.0], [65.8, 214020.0], [65.9, 214087.0], [66.0, 214087.0], [66.1, 214087.0], [66.2, 214087.0], [66.3, 214087.0], [66.4, 214087.0], [66.5, 214087.0], [66.6, 214087.0], [66.7, 214132.0], [66.8, 214132.0], [66.9, 214132.0], [67.0, 214132.0], [67.1, 214132.0], [67.2, 214132.0], [67.3, 214132.0], [67.4, 214132.0], [67.5, 214132.0], [67.6, 214226.0], [67.7, 214226.0], [67.8, 214226.0], [67.9, 214226.0], [68.0, 214226.0], [68.1, 214226.0], [68.2, 214226.0], [68.3, 214226.0], [68.4, 214267.0], [68.5, 214267.0], [68.6, 214267.0], [68.7, 214267.0], [68.8, 214267.0], [68.9, 214267.0], [69.0, 214267.0], [69.1, 214267.0], [69.2, 214504.0], [69.3, 214504.0], [69.4, 214504.0], [69.5, 214504.0], [69.6, 214504.0], [69.7, 214504.0], [69.8, 214504.0], [69.9, 214504.0], [70.0, 214504.0], [70.1, 214735.0], [70.2, 214735.0], [70.3, 214735.0], [70.4, 214735.0], [70.5, 214735.0], [70.6, 214735.0], [70.7, 214735.0], [70.8, 214735.0], [70.9, 214899.0], [71.0, 214899.0], [71.1, 214899.0], [71.2, 214899.0], [71.3, 214899.0], [71.4, 214899.0], [71.5, 214899.0], [71.6, 214899.0], [71.7, 214979.0], [71.8, 214979.0], [71.9, 214979.0], [72.0, 214979.0], [72.1, 214979.0], [72.2, 214979.0], [72.3, 214979.0], [72.4, 214979.0], [72.5, 214979.0], [72.6, 215009.0], [72.7, 215009.0], [72.8, 215009.0], [72.9, 215009.0], [73.0, 215009.0], [73.1, 215009.0], [73.2, 215009.0], [73.3, 215009.0], [73.4, 215058.0], [73.5, 215058.0], [73.6, 215058.0], [73.7, 215058.0], [73.8, 215058.0], [73.9, 215058.0], [74.0, 215058.0], [74.1, 215058.0], [74.2, 215125.0], [74.3, 215125.0], [74.4, 215125.0], [74.5, 215125.0], [74.6, 215125.0], [74.7, 215125.0], [74.8, 215125.0], [74.9, 215125.0], [75.0, 215125.0], [75.1, 215219.0], [75.2, 215219.0], [75.3, 215219.0], [75.4, 215219.0], [75.5, 215219.0], [75.6, 215219.0], [75.7, 215219.0], [75.8, 215219.0], [75.9, 215383.0], [76.0, 215383.0], [76.1, 215383.0], [76.2, 215383.0], [76.3, 215383.0], [76.4, 215383.0], [76.5, 215383.0], [76.6, 215383.0], [76.7, 215454.0], [76.8, 215454.0], [76.9, 215454.0], [77.0, 215454.0], [77.1, 215454.0], [77.2, 215454.0], [77.3, 215454.0], [77.4, 215454.0], [77.5, 215605.0], [77.6, 215605.0], [77.7, 215605.0], [77.8, 215605.0], [77.9, 215605.0], [78.0, 215605.0], [78.1, 215605.0], [78.2, 215605.0], [78.3, 215605.0], [78.4, 215729.0], [78.5, 215729.0], [78.6, 215729.0], [78.7, 215729.0], [78.8, 215729.0], [78.9, 215729.0], [79.0, 215729.0], [79.1, 215729.0], [79.2, 215841.0], [79.3, 215841.0], [79.4, 215841.0], [79.5, 215841.0], [79.6, 215841.0], [79.7, 215841.0], [79.8, 215841.0], [79.9, 215841.0], [80.0, 215980.0], [80.1, 215980.0], [80.2, 215980.0], [80.3, 215980.0], [80.4, 215980.0], [80.5, 215980.0], [80.6, 215980.0], [80.7, 215980.0], [80.8, 215980.0], [80.9, 216047.0], [81.0, 216047.0], [81.1, 216047.0], [81.2, 216047.0], [81.3, 216047.0], [81.4, 216047.0], [81.5, 216047.0], [81.6, 216047.0], [81.7, 216269.0], [81.8, 216269.0], [81.9, 216269.0], [82.0, 216269.0], [82.1, 216269.0], [82.2, 216269.0], [82.3, 216269.0], [82.4, 216269.0], [82.5, 216772.0], [82.6, 216772.0], [82.7, 216772.0], [82.8, 216772.0], [82.9, 216772.0], [83.0, 216772.0], [83.1, 216772.0], [83.2, 216772.0], [83.3, 216772.0], [83.4, 216781.0], [83.5, 216781.0], [83.6, 216781.0], [83.7, 216781.0], [83.8, 216781.0], [83.9, 216781.0], [84.0, 216781.0], [84.1, 216781.0], [84.2, 216802.0], [84.3, 216802.0], [84.4, 216802.0], [84.5, 216802.0], [84.6, 216802.0], [84.7, 216802.0], [84.8, 216802.0], [84.9, 216802.0], [85.0, 216945.0], [85.1, 216945.0], [85.2, 216945.0], [85.3, 216945.0], [85.4, 216945.0], [85.5, 216945.0], [85.6, 216945.0], [85.7, 216945.0], [85.8, 216945.0], [85.9, 217454.0], [86.0, 217454.0], [86.1, 217454.0], [86.2, 217454.0], [86.3, 217454.0], [86.4, 217454.0], [86.5, 217454.0], [86.6, 217454.0], [86.7, 217718.0], [86.8, 217718.0], [86.9, 217718.0], [87.0, 217718.0], [87.1, 217718.0], [87.2, 217718.0], [87.3, 217718.0], [87.4, 217718.0], [87.5, 217756.0], [87.6, 217756.0], [87.7, 217756.0], [87.8, 217756.0], [87.9, 217756.0], [88.0, 217756.0], [88.1, 217756.0], [88.2, 217756.0], [88.3, 217756.0], [88.4, 217805.0], [88.5, 217805.0], [88.6, 217805.0], [88.7, 217805.0], [88.8, 217805.0], [88.9, 217805.0], [89.0, 217805.0], [89.1, 217805.0], [89.2, 218348.0], [89.3, 218348.0], [89.4, 218348.0], [89.5, 218348.0], [89.6, 218348.0], [89.7, 218348.0], [89.8, 218348.0], [89.9, 218348.0], [90.0, 218680.0], [90.1, 218680.0], [90.2, 218680.0], [90.3, 218680.0], [90.4, 218680.0], [90.5, 218680.0], [90.6, 218680.0], [90.7, 218680.0], [90.8, 218680.0], [90.9, 218847.0], [91.0, 218847.0], [91.1, 218847.0], [91.2, 218847.0], [91.3, 218847.0], [91.4, 218847.0], [91.5, 218847.0], [91.6, 218847.0], [91.7, 218867.0], [91.8, 218867.0], [91.9, 218867.0], [92.0, 218867.0], [92.1, 218867.0], [92.2, 218867.0], [92.3, 218867.0], [92.4, 218867.0], [92.5, 218951.0], [92.6, 218951.0], [92.7, 218951.0], [92.8, 218951.0], [92.9, 218951.0], [93.0, 218951.0], [93.1, 218951.0], [93.2, 218951.0], [93.3, 218951.0], [93.4, 219020.0], [93.5, 219020.0], [93.6, 219020.0], [93.7, 219020.0], [93.8, 219020.0], [93.9, 219020.0], [94.0, 219020.0], [94.1, 219020.0], [94.2, 219022.0], [94.3, 219022.0], [94.4, 219022.0], [94.5, 219022.0], [94.6, 219022.0], [94.7, 219022.0], [94.8, 219022.0], [94.9, 219022.0], [95.0, 219327.0], [95.1, 219327.0], [95.2, 219327.0], [95.3, 219327.0], [95.4, 219327.0], [95.5, 219327.0], [95.6, 219327.0], [95.7, 219327.0], [95.8, 219327.0], [95.9, 219804.0], [96.0, 219804.0], [96.1, 219804.0], [96.2, 219804.0], [96.3, 219804.0], [96.4, 219804.0], [96.5, 219804.0], [96.6, 219804.0], [96.7, 220007.0], [96.8, 220007.0], [96.9, 220007.0], [97.0, 220007.0], [97.1, 220007.0], [97.2, 220007.0], [97.3, 220007.0], [97.4, 220007.0], [97.5, 220894.0], [97.6, 220894.0], [97.7, 220894.0], [97.8, 220894.0], [97.9, 220894.0], [98.0, 220894.0], [98.1, 220894.0], [98.2, 220894.0], [98.3, 220894.0], [98.4, 223960.0], [98.5, 223960.0], [98.6, 223960.0], [98.7, 223960.0], [98.8, 223960.0], [98.9, 223960.0], [99.0, 223960.0], [99.1, 223960.0], [99.2, 225336.0], [99.3, 225336.0], [99.4, 225336.0], [99.5, 225336.0], [99.6, 225336.0], [99.7, 225336.0], [99.8, 225336.0], [99.9, 225336.0]], "isOverall": false, "label": "HTTP Request", "isController": false}], "supportsControllersDiscrimination": true, "maxX": 100.0, "title": "Response Time Percentiles"}},
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
        data: {"result": {"minY": 1.0, "minX": 194900.0, "maxY": 3.0, "series": [{"data": [[204000.0, 1.0], [200800.0, 1.0], [200000.0, 1.0], [201600.0, 1.0], [203200.0, 1.0], [208000.0, 1.0], [207200.0, 1.0], [211200.0, 1.0], [220000.0, 1.0], [216800.0, 1.0], [220800.0, 1.0], [216000.0, 1.0], [215200.0, 1.0], [204100.0, 2.0], [206500.0, 2.0], [205700.0, 1.0], [212900.0, 1.0], [208900.0, 1.0], [210500.0, 1.0], [209700.0, 1.0], [208100.0, 1.0], [214500.0, 1.0], [217700.0, 2.0], [219300.0, 1.0], [213700.0, 3.0], [215300.0, 1.0], [216900.0, 1.0], [207400.0, 2.0], [208200.0, 1.0], [209000.0, 1.0], [212200.0, 1.0], [210600.0, 1.0], [217800.0, 1.0], [218600.0, 1.0], [216200.0, 1.0], [215400.0, 1.0], [197900.0, 1.0], [201100.0, 1.0], [200300.0, 1.0], [204300.0, 1.0], [206700.0, 1.0], [205900.0, 1.0], [208300.0, 1.0], [210700.0, 1.0], [211500.0, 1.0], [213100.0, 2.0], [213900.0, 2.0], [214700.0, 1.0], [198800.0, 1.0], [206000.0, 1.0], [206800.0, 1.0], [205200.0, 1.0], [208400.0, 1.0], [210800.0, 2.0], [212400.0, 1.0], [207600.0, 1.0], [218800.0, 2.0], [214000.0, 2.0], [214800.0, 1.0], [215600.0, 1.0], [194900.0, 2.0], [203700.0, 1.0], [197300.0, 1.0], [199700.0, 2.0], [201300.0, 1.0], [212500.0, 1.0], [205300.0, 1.0], [208500.0, 2.0], [206900.0, 2.0], [210900.0, 1.0], [214100.0, 1.0], [214900.0, 1.0], [218900.0, 1.0], [215700.0, 1.0], [225300.0, 1.0], [196600.0, 1.0], [201400.0, 1.0], [203000.0, 1.0], [204600.0, 1.0], [205400.0, 2.0], [207000.0, 1.0], [206200.0, 1.0], [219800.0, 1.0], [215000.0, 2.0], [217400.0, 1.0], [219000.0, 2.0], [215800.0, 1.0], [213400.0, 1.0], [214200.0, 2.0], [203100.0, 1.0], [205500.0, 1.0], [207100.0, 1.0], [212700.0, 1.0], [211100.0, 1.0], [213500.0, 1.0], [216700.0, 2.0], [218300.0, 1.0], [215100.0, 1.0], [215900.0, 1.0], [223900.0, 1.0]], "isOverall": false, "label": "HTTP Request", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 100, "maxX": 225300.0, "title": "Response Time Distribution"}},
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
        data: {"result": {"minY": 30.566666666666674, "minX": 1.52081268E12, "maxY": 60.0, "series": [{"data": [[1.52081292E12, 30.566666666666674], [1.52081268E12, 60.0]], "isOverall": false, "label": "Thread Group", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.52081292E12, "title": "Active Threads Over Time"}},
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
        data: {"result": {"minY": 205255.67213114747, "minX": 1.0, "maxY": 223960.0, "series": [{"data": [[2.0, 211525.0], [3.0, 215980.0], [4.0, 211197.0], [5.0, 213475.0], [6.0, 214504.0], [7.0, 213709.0], [8.0, 215605.0], [10.0, 214401.5], [11.0, 212771.0], [12.0, 214226.0], [14.0, 212898.0], [15.0, 212521.0], [16.0, 213755.0], [17.0, 216945.0], [18.0, 212476.0], [19.0, 215383.0], [20.0, 217756.0], [21.0, 215219.0], [22.0, 211275.0], [23.0, 218348.0], [24.0, 214735.0], [25.0, 214087.0], [26.0, 213786.0], [27.0, 213989.0], [28.0, 216781.0], [29.0, 216269.0], [30.0, 215454.0], [31.0, 216047.0], [33.0, 215009.0], [32.0, 214020.0], [35.0, 222179.0], [37.0, 214267.0], [36.0, 212961.0], [38.0, 215841.0], [41.0, 215729.0], [40.0, 218237.0], [43.0, 218847.0], [42.0, 223960.0], [45.0, 215058.0], [44.0, 216772.0], [47.0, 218867.0], [46.0, 213566.0], [49.0, 220007.0], [48.0, 214132.0], [51.0, 218951.0], [50.0, 212203.0], [53.0, 219327.0], [52.0, 213192.0], [55.0, 220894.0], [54.0, 217718.0], [57.0, 218680.0], [56.0, 214979.0], [59.0, 216802.0], [58.0, 219804.0], [60.0, 205255.67213114747], [1.0, 207656.0]], "isOverall": false, "label": "HTTP Request", "isController": false}, {"data": [[45.283333333333346, 210359.05833333332]], "isOverall": false, "label": "HTTP Request-Aggregated", "isController": false}], "supportsControllersDiscrimination": true, "maxX": 60.0, "title": "Time VS Threads"}},
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
        data : {"result": {"minY": 127.0, "minX": 1.52081268E12, "maxY": 43293.0, "series": [{"data": [[1.52081292E12, 43293.0], [1.52081268E12, 43293.0]], "isOverall": false, "label": "Bytes received per second", "isController": false}, {"data": [[1.52081292E12, 127.0], [1.52081268E12, 127.0]], "isOverall": false, "label": "Bytes sent per second", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.52081292E12, "title": "Bytes Throughput Over Time"}},
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
        data: {"result": {"minY": 205046.5166666666, "minX": 1.52081268E12, "maxY": 215671.6, "series": [{"data": [[1.52081292E12, 215671.6], [1.52081268E12, 205046.5166666666]], "isOverall": false, "label": "HTTP Request", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.52081292E12, "title": "Response Time Over Time"}},
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
        data: {"result": {"minY": 36215.85, "minX": 1.52081268E12, "maxY": 41448.19999999998, "series": [{"data": [[1.52081292E12, 41448.19999999998], [1.52081268E12, 36215.85]], "isOverall": false, "label": "HTTP Request", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.52081292E12, "title": "Latencies Over Time"}},
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
        data: {"result": {"minY": 7.683333333333336, "minX": 1.52081268E12, "maxY": 9.733333333333336, "series": [{"data": [[1.52081292E12, 7.683333333333336], [1.52081268E12, 9.733333333333336]], "isOverall": false, "label": "HTTP Request", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.52081292E12, "title": "Connect Time Over Time"}},
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
        data: {"result": {"minY": 194908.0, "minX": 1.52081268E12, "maxY": 225336.0, "series": [{"data": [[1.52081292E12, 225336.0], [1.52081268E12, 213173.0]], "isOverall": false, "label": "Max", "isController": false}, {"data": [[1.52081292E12, 207656.0], [1.52081268E12, 194908.0]], "isOverall": false, "label": "Min", "isController": false}, {"data": [[1.52081292E12, 218646.8], [1.52081268E12, 210439.9]], "isOverall": false, "label": "90th percentile", "isController": false}, {"data": [[1.52081292E12, 225047.03999999998], [1.52081268E12, 213173.0]], "isOverall": false, "label": "99th percentile", "isController": false}, {"data": [[1.52081292E12, 219311.75], [1.52081268E12, 210843.85]], "isOverall": false, "label": "95th percentile", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.52081292E12, "title": "Response Time Percentiles Over Time (successful requests only)"}},
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
    data: {"result": {"minY": 210906.0, "minX": 1.0, "maxY": 210906.0, "series": [{"data": [[1.0, 210906.0]], "isOverall": false, "label": "Successes", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.0, "title": "Response Time Vs Request"}},
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
    data: {"result": {"minY": 39831.0, "minX": 1.0, "maxY": 39831.0, "series": [{"data": [[1.0, 39831.0]], "isOverall": false, "label": "Successes", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.0, "title": "Latencies Vs Request"}},
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
        data: {"result": {"minY": 1.0, "minX": 1.5208125E12, "maxY": 1.0, "series": [{"data": [[1.5208125E12, 1.0], [1.52081268E12, 1.0]], "isOverall": false, "label": "hitsPerSecond", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.52081268E12, "title": "Hits Per Second"}},
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
        data: {"result": {"minY": 1.0, "minX": 1.52081268E12, "maxY": 1.0, "series": [{"data": [[1.52081292E12, 1.0], [1.52081268E12, 1.0]], "isOverall": false, "label": "200", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.52081292E12, "title": "Codes Per Second"}},
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
        data: {"result": {"minY": 1.0, "minX": 1.52081268E12, "maxY": 1.0, "series": [{"data": [[1.52081292E12, 1.0], [1.52081268E12, 1.0]], "isOverall": false, "label": "HTTP Request-success", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.52081292E12, "title": "Transactions Per Second"}},
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
