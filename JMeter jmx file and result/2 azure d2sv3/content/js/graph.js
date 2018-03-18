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
        data: {"result": {"minY": 295607.0, "minX": 0.0, "maxY": 339112.0, "series": [{"data": [[0.0, 295607.0], [0.1, 295607.0], [0.2, 295607.0], [0.3, 295607.0], [0.4, 295607.0], [0.5, 295607.0], [0.6, 295607.0], [0.7, 295607.0], [0.8, 295607.0], [0.9, 298604.0], [1.0, 298604.0], [1.1, 298604.0], [1.2, 298604.0], [1.3, 298604.0], [1.4, 298604.0], [1.5, 298604.0], [1.6, 298604.0], [1.7, 301317.0], [1.8, 301317.0], [1.9, 301317.0], [2.0, 301317.0], [2.1, 301317.0], [2.2, 301317.0], [2.3, 301317.0], [2.4, 301317.0], [2.5, 301817.0], [2.6, 301817.0], [2.7, 301817.0], [2.8, 301817.0], [2.9, 301817.0], [3.0, 301817.0], [3.1, 301817.0], [3.2, 301817.0], [3.3, 301817.0], [3.4, 302578.0], [3.5, 302578.0], [3.6, 302578.0], [3.7, 302578.0], [3.8, 302578.0], [3.9, 302578.0], [4.0, 302578.0], [4.1, 302578.0], [4.2, 303424.0], [4.3, 303424.0], [4.4, 303424.0], [4.5, 303424.0], [4.6, 303424.0], [4.7, 303424.0], [4.8, 303424.0], [4.9, 303424.0], [5.0, 304649.0], [5.1, 304649.0], [5.2, 304649.0], [5.3, 304649.0], [5.4, 304649.0], [5.5, 304649.0], [5.6, 304649.0], [5.7, 304649.0], [5.8, 304649.0], [5.9, 305312.0], [6.0, 305312.0], [6.1, 305312.0], [6.2, 305312.0], [6.3, 305312.0], [6.4, 305312.0], [6.5, 305312.0], [6.6, 305312.0], [6.7, 306092.0], [6.8, 306092.0], [6.9, 306092.0], [7.0, 306092.0], [7.1, 306092.0], [7.2, 306092.0], [7.3, 306092.0], [7.4, 306092.0], [7.5, 308970.0], [7.6, 308970.0], [7.7, 308970.0], [7.8, 308970.0], [7.9, 308970.0], [8.0, 308970.0], [8.1, 308970.0], [8.2, 308970.0], [8.3, 308970.0], [8.4, 311013.0], [8.5, 311013.0], [8.6, 311013.0], [8.7, 311013.0], [8.8, 311013.0], [8.9, 311013.0], [9.0, 311013.0], [9.1, 311013.0], [9.2, 311412.0], [9.3, 311412.0], [9.4, 311412.0], [9.5, 311412.0], [9.6, 311412.0], [9.7, 311412.0], [9.8, 311412.0], [9.9, 311412.0], [10.0, 312086.0], [10.1, 312086.0], [10.2, 312086.0], [10.3, 312086.0], [10.4, 312086.0], [10.5, 312086.0], [10.6, 312086.0], [10.7, 312086.0], [10.8, 312086.0], [10.9, 312940.0], [11.0, 312940.0], [11.1, 312940.0], [11.2, 312940.0], [11.3, 312940.0], [11.4, 312940.0], [11.5, 312940.0], [11.6, 312940.0], [11.7, 313445.0], [11.8, 313445.0], [11.9, 313445.0], [12.0, 313445.0], [12.1, 313445.0], [12.2, 313445.0], [12.3, 313445.0], [12.4, 313445.0], [12.5, 313445.0], [12.6, 314507.0], [12.7, 314507.0], [12.8, 314507.0], [12.9, 314507.0], [13.0, 314507.0], [13.1, 314507.0], [13.2, 314507.0], [13.3, 314507.0], [13.4, 314626.0], [13.5, 314626.0], [13.6, 314626.0], [13.7, 314626.0], [13.8, 314626.0], [13.9, 314626.0], [14.0, 314626.0], [14.1, 314626.0], [14.2, 314779.0], [14.3, 314779.0], [14.4, 314779.0], [14.5, 314779.0], [14.6, 314779.0], [14.7, 314779.0], [14.8, 314779.0], [14.9, 314779.0], [15.0, 314779.0], [15.1, 315587.0], [15.2, 315587.0], [15.3, 315587.0], [15.4, 315587.0], [15.5, 315587.0], [15.6, 315587.0], [15.7, 315587.0], [15.8, 315587.0], [15.9, 315930.0], [16.0, 315930.0], [16.1, 315930.0], [16.2, 315930.0], [16.3, 315930.0], [16.4, 315930.0], [16.5, 315930.0], [16.6, 315930.0], [16.7, 316197.0], [16.8, 316197.0], [16.9, 316197.0], [17.0, 316197.0], [17.1, 316197.0], [17.2, 316197.0], [17.3, 316197.0], [17.4, 316197.0], [17.5, 316197.0], [17.6, 316333.0], [17.7, 316333.0], [17.8, 316333.0], [17.9, 316333.0], [18.0, 316333.0], [18.1, 316333.0], [18.2, 316333.0], [18.3, 316333.0], [18.4, 316407.0], [18.5, 316407.0], [18.6, 316407.0], [18.7, 316407.0], [18.8, 316407.0], [18.9, 316407.0], [19.0, 316407.0], [19.1, 316407.0], [19.2, 316407.0], [19.3, 316407.0], [19.4, 316407.0], [19.5, 316407.0], [19.6, 316407.0], [19.7, 316407.0], [19.8, 316407.0], [19.9, 316407.0], [20.0, 316407.0], [20.1, 317356.0], [20.2, 317356.0], [20.3, 317356.0], [20.4, 317356.0], [20.5, 317356.0], [20.6, 317356.0], [20.7, 317356.0], [20.8, 317356.0], [20.9, 317451.0], [21.0, 317451.0], [21.1, 317451.0], [21.2, 317451.0], [21.3, 317451.0], [21.4, 317451.0], [21.5, 317451.0], [21.6, 317451.0], [21.7, 317739.0], [21.8, 317739.0], [21.9, 317739.0], [22.0, 317739.0], [22.1, 317739.0], [22.2, 317739.0], [22.3, 317739.0], [22.4, 317739.0], [22.5, 317804.0], [22.6, 317804.0], [22.7, 317804.0], [22.8, 317804.0], [22.9, 317804.0], [23.0, 317804.0], [23.1, 317804.0], [23.2, 317804.0], [23.3, 317804.0], [23.4, 317994.0], [23.5, 317994.0], [23.6, 317994.0], [23.7, 317994.0], [23.8, 317994.0], [23.9, 317994.0], [24.0, 317994.0], [24.1, 317994.0], [24.2, 318454.0], [24.3, 318454.0], [24.4, 318454.0], [24.5, 318454.0], [24.6, 318454.0], [24.7, 318454.0], [24.8, 318454.0], [24.9, 318454.0], [25.0, 318599.0], [25.1, 318599.0], [25.2, 318599.0], [25.3, 318599.0], [25.4, 318599.0], [25.5, 318599.0], [25.6, 318599.0], [25.7, 318599.0], [25.8, 318599.0], [25.9, 318660.0], [26.0, 318660.0], [26.1, 318660.0], [26.2, 318660.0], [26.3, 318660.0], [26.4, 318660.0], [26.5, 318660.0], [26.6, 318660.0], [26.7, 318727.0], [26.8, 318727.0], [26.9, 318727.0], [27.0, 318727.0], [27.1, 318727.0], [27.2, 318727.0], [27.3, 318727.0], [27.4, 318727.0], [27.5, 318732.0], [27.6, 318732.0], [27.7, 318732.0], [27.8, 318732.0], [27.9, 318732.0], [28.0, 318732.0], [28.1, 318732.0], [28.2, 318732.0], [28.3, 318732.0], [28.4, 318762.0], [28.5, 318762.0], [28.6, 318762.0], [28.7, 318762.0], [28.8, 318762.0], [28.9, 318762.0], [29.0, 318762.0], [29.1, 318762.0], [29.2, 318871.0], [29.3, 318871.0], [29.4, 318871.0], [29.5, 318871.0], [29.6, 318871.0], [29.7, 318871.0], [29.8, 318871.0], [29.9, 318871.0], [30.0, 319328.0], [30.1, 319328.0], [30.2, 319328.0], [30.3, 319328.0], [30.4, 319328.0], [30.5, 319328.0], [30.6, 319328.0], [30.7, 319328.0], [30.8, 319328.0], [30.9, 319335.0], [31.0, 319335.0], [31.1, 319335.0], [31.2, 319335.0], [31.3, 319335.0], [31.4, 319335.0], [31.5, 319335.0], [31.6, 319335.0], [31.7, 319598.0], [31.8, 319598.0], [31.9, 319598.0], [32.0, 319598.0], [32.1, 319598.0], [32.2, 319598.0], [32.3, 319598.0], [32.4, 319598.0], [32.5, 319650.0], [32.6, 319650.0], [32.7, 319650.0], [32.8, 319650.0], [32.9, 319650.0], [33.0, 319650.0], [33.1, 319650.0], [33.2, 319650.0], [33.3, 319650.0], [33.4, 319724.0], [33.5, 319724.0], [33.6, 319724.0], [33.7, 319724.0], [33.8, 319724.0], [33.9, 319724.0], [34.0, 319724.0], [34.1, 319724.0], [34.2, 319891.0], [34.3, 319891.0], [34.4, 319891.0], [34.5, 319891.0], [34.6, 319891.0], [34.7, 319891.0], [34.8, 319891.0], [34.9, 319891.0], [35.0, 319922.0], [35.1, 319922.0], [35.2, 319922.0], [35.3, 319922.0], [35.4, 319922.0], [35.5, 319922.0], [35.6, 319922.0], [35.7, 319922.0], [35.8, 319922.0], [35.9, 320018.0], [36.0, 320018.0], [36.1, 320018.0], [36.2, 320018.0], [36.3, 320018.0], [36.4, 320018.0], [36.5, 320018.0], [36.6, 320018.0], [36.7, 320031.0], [36.8, 320031.0], [36.9, 320031.0], [37.0, 320031.0], [37.1, 320031.0], [37.2, 320031.0], [37.3, 320031.0], [37.4, 320031.0], [37.5, 320283.0], [37.6, 320283.0], [37.7, 320283.0], [37.8, 320283.0], [37.9, 320283.0], [38.0, 320283.0], [38.1, 320283.0], [38.2, 320283.0], [38.3, 320283.0], [38.4, 320447.0], [38.5, 320447.0], [38.6, 320447.0], [38.7, 320447.0], [38.8, 320447.0], [38.9, 320447.0], [39.0, 320447.0], [39.1, 320447.0], [39.2, 320473.0], [39.3, 320473.0], [39.4, 320473.0], [39.5, 320473.0], [39.6, 320473.0], [39.7, 320473.0], [39.8, 320473.0], [39.9, 320473.0], [40.0, 320473.0], [40.1, 320488.0], [40.2, 320488.0], [40.3, 320488.0], [40.4, 320488.0], [40.5, 320488.0], [40.6, 320488.0], [40.7, 320488.0], [40.8, 320488.0], [40.9, 321118.0], [41.0, 321118.0], [41.1, 321118.0], [41.2, 321118.0], [41.3, 321118.0], [41.4, 321118.0], [41.5, 321118.0], [41.6, 321118.0], [41.7, 321528.0], [41.8, 321528.0], [41.9, 321528.0], [42.0, 321528.0], [42.1, 321528.0], [42.2, 321528.0], [42.3, 321528.0], [42.4, 321528.0], [42.5, 321528.0], [42.6, 321580.0], [42.7, 321580.0], [42.8, 321580.0], [42.9, 321580.0], [43.0, 321580.0], [43.1, 321580.0], [43.2, 321580.0], [43.3, 321580.0], [43.4, 321725.0], [43.5, 321725.0], [43.6, 321725.0], [43.7, 321725.0], [43.8, 321725.0], [43.9, 321725.0], [44.0, 321725.0], [44.1, 321725.0], [44.2, 321830.0], [44.3, 321830.0], [44.4, 321830.0], [44.5, 321830.0], [44.6, 321830.0], [44.7, 321830.0], [44.8, 321830.0], [44.9, 321830.0], [45.0, 321830.0], [45.1, 322012.0], [45.2, 322012.0], [45.3, 322012.0], [45.4, 322012.0], [45.5, 322012.0], [45.6, 322012.0], [45.7, 322012.0], [45.8, 322012.0], [45.9, 322290.0], [46.0, 322290.0], [46.1, 322290.0], [46.2, 322290.0], [46.3, 322290.0], [46.4, 322290.0], [46.5, 322290.0], [46.6, 322290.0], [46.7, 322346.0], [46.8, 322346.0], [46.9, 322346.0], [47.0, 322346.0], [47.1, 322346.0], [47.2, 322346.0], [47.3, 322346.0], [47.4, 322346.0], [47.5, 322346.0], [47.6, 322543.0], [47.7, 322543.0], [47.8, 322543.0], [47.9, 322543.0], [48.0, 322543.0], [48.1, 322543.0], [48.2, 322543.0], [48.3, 322543.0], [48.4, 322544.0], [48.5, 322544.0], [48.6, 322544.0], [48.7, 322544.0], [48.8, 322544.0], [48.9, 322544.0], [49.0, 322544.0], [49.1, 322544.0], [49.2, 322636.0], [49.3, 322636.0], [49.4, 322636.0], [49.5, 322636.0], [49.6, 322636.0], [49.7, 322636.0], [49.8, 322636.0], [49.9, 322636.0], [50.0, 322636.0], [50.1, 322754.0], [50.2, 322754.0], [50.3, 322754.0], [50.4, 322754.0], [50.5, 322754.0], [50.6, 322754.0], [50.7, 322754.0], [50.8, 322754.0], [50.9, 322802.0], [51.0, 322802.0], [51.1, 322802.0], [51.2, 322802.0], [51.3, 322802.0], [51.4, 322802.0], [51.5, 322802.0], [51.6, 322802.0], [51.7, 322852.0], [51.8, 322852.0], [51.9, 322852.0], [52.0, 322852.0], [52.1, 322852.0], [52.2, 322852.0], [52.3, 322852.0], [52.4, 322852.0], [52.5, 322852.0], [52.6, 322905.0], [52.7, 322905.0], [52.8, 322905.0], [52.9, 322905.0], [53.0, 322905.0], [53.1, 322905.0], [53.2, 322905.0], [53.3, 322905.0], [53.4, 323380.0], [53.5, 323380.0], [53.6, 323380.0], [53.7, 323380.0], [53.8, 323380.0], [53.9, 323380.0], [54.0, 323380.0], [54.1, 323380.0], [54.2, 323429.0], [54.3, 323429.0], [54.4, 323429.0], [54.5, 323429.0], [54.6, 323429.0], [54.7, 323429.0], [54.8, 323429.0], [54.9, 323429.0], [55.0, 323429.0], [55.1, 323555.0], [55.2, 323555.0], [55.3, 323555.0], [55.4, 323555.0], [55.5, 323555.0], [55.6, 323555.0], [55.7, 323555.0], [55.8, 323555.0], [55.9, 323620.0], [56.0, 323620.0], [56.1, 323620.0], [56.2, 323620.0], [56.3, 323620.0], [56.4, 323620.0], [56.5, 323620.0], [56.6, 323620.0], [56.7, 323692.0], [56.8, 323692.0], [56.9, 323692.0], [57.0, 323692.0], [57.1, 323692.0], [57.2, 323692.0], [57.3, 323692.0], [57.4, 323692.0], [57.5, 323692.0], [57.6, 323713.0], [57.7, 323713.0], [57.8, 323713.0], [57.9, 323713.0], [58.0, 323713.0], [58.1, 323713.0], [58.2, 323713.0], [58.3, 323713.0], [58.4, 323758.0], [58.5, 323758.0], [58.6, 323758.0], [58.7, 323758.0], [58.8, 323758.0], [58.9, 323758.0], [59.0, 323758.0], [59.1, 323758.0], [59.2, 323769.0], [59.3, 323769.0], [59.4, 323769.0], [59.5, 323769.0], [59.6, 323769.0], [59.7, 323769.0], [59.8, 323769.0], [59.9, 323769.0], [60.0, 323769.0], [60.1, 323826.0], [60.2, 323826.0], [60.3, 323826.0], [60.4, 323826.0], [60.5, 323826.0], [60.6, 323826.0], [60.7, 323826.0], [60.8, 323826.0], [60.9, 323879.0], [61.0, 323879.0], [61.1, 323879.0], [61.2, 323879.0], [61.3, 323879.0], [61.4, 323879.0], [61.5, 323879.0], [61.6, 323879.0], [61.7, 323990.0], [61.8, 323990.0], [61.9, 323990.0], [62.0, 323990.0], [62.1, 323990.0], [62.2, 323990.0], [62.3, 323990.0], [62.4, 323990.0], [62.5, 323990.0], [62.6, 324168.0], [62.7, 324168.0], [62.8, 324168.0], [62.9, 324168.0], [63.0, 324168.0], [63.1, 324168.0], [63.2, 324168.0], [63.3, 324168.0], [63.4, 324204.0], [63.5, 324204.0], [63.6, 324204.0], [63.7, 324204.0], [63.8, 324204.0], [63.9, 324204.0], [64.0, 324204.0], [64.1, 324204.0], [64.2, 324214.0], [64.3, 324214.0], [64.4, 324214.0], [64.5, 324214.0], [64.6, 324214.0], [64.7, 324214.0], [64.8, 324214.0], [64.9, 324214.0], [65.0, 324214.0], [65.1, 324241.0], [65.2, 324241.0], [65.3, 324241.0], [65.4, 324241.0], [65.5, 324241.0], [65.6, 324241.0], [65.7, 324241.0], [65.8, 324241.0], [65.9, 324467.0], [66.0, 324467.0], [66.1, 324467.0], [66.2, 324467.0], [66.3, 324467.0], [66.4, 324467.0], [66.5, 324467.0], [66.6, 324467.0], [66.7, 324734.0], [66.8, 324734.0], [66.9, 324734.0], [67.0, 324734.0], [67.1, 324734.0], [67.2, 324734.0], [67.3, 324734.0], [67.4, 324734.0], [67.5, 324734.0], [67.6, 324904.0], [67.7, 324904.0], [67.8, 324904.0], [67.9, 324904.0], [68.0, 324904.0], [68.1, 324904.0], [68.2, 324904.0], [68.3, 324904.0], [68.4, 324979.0], [68.5, 324979.0], [68.6, 324979.0], [68.7, 324979.0], [68.8, 324979.0], [68.9, 324979.0], [69.0, 324979.0], [69.1, 324979.0], [69.2, 325158.0], [69.3, 325158.0], [69.4, 325158.0], [69.5, 325158.0], [69.6, 325158.0], [69.7, 325158.0], [69.8, 325158.0], [69.9, 325158.0], [70.0, 325158.0], [70.1, 325246.0], [70.2, 325246.0], [70.3, 325246.0], [70.4, 325246.0], [70.5, 325246.0], [70.6, 325246.0], [70.7, 325246.0], [70.8, 325246.0], [70.9, 325259.0], [71.0, 325259.0], [71.1, 325259.0], [71.2, 325259.0], [71.3, 325259.0], [71.4, 325259.0], [71.5, 325259.0], [71.6, 325259.0], [71.7, 325289.0], [71.8, 325289.0], [71.9, 325289.0], [72.0, 325289.0], [72.1, 325289.0], [72.2, 325289.0], [72.3, 325289.0], [72.4, 325289.0], [72.5, 325289.0], [72.6, 325520.0], [72.7, 325520.0], [72.8, 325520.0], [72.9, 325520.0], [73.0, 325520.0], [73.1, 325520.0], [73.2, 325520.0], [73.3, 325520.0], [73.4, 325608.0], [73.5, 325608.0], [73.6, 325608.0], [73.7, 325608.0], [73.8, 325608.0], [73.9, 325608.0], [74.0, 325608.0], [74.1, 325608.0], [74.2, 325648.0], [74.3, 325648.0], [74.4, 325648.0], [74.5, 325648.0], [74.6, 325648.0], [74.7, 325648.0], [74.8, 325648.0], [74.9, 325648.0], [75.0, 325648.0], [75.1, 325724.0], [75.2, 325724.0], [75.3, 325724.0], [75.4, 325724.0], [75.5, 325724.0], [75.6, 325724.0], [75.7, 325724.0], [75.8, 325724.0], [75.9, 325855.0], [76.0, 325855.0], [76.1, 325855.0], [76.2, 325855.0], [76.3, 325855.0], [76.4, 325855.0], [76.5, 325855.0], [76.6, 325855.0], [76.7, 326002.0], [76.8, 326002.0], [76.9, 326002.0], [77.0, 326002.0], [77.1, 326002.0], [77.2, 326002.0], [77.3, 326002.0], [77.4, 326002.0], [77.5, 326308.0], [77.6, 326308.0], [77.7, 326308.0], [77.8, 326308.0], [77.9, 326308.0], [78.0, 326308.0], [78.1, 326308.0], [78.2, 326308.0], [78.3, 326308.0], [78.4, 326735.0], [78.5, 326735.0], [78.6, 326735.0], [78.7, 326735.0], [78.8, 326735.0], [78.9, 326735.0], [79.0, 326735.0], [79.1, 326735.0], [79.2, 326953.0], [79.3, 326953.0], [79.4, 326953.0], [79.5, 326953.0], [79.6, 326953.0], [79.7, 326953.0], [79.8, 326953.0], [79.9, 326953.0], [80.0, 327031.0], [80.1, 327031.0], [80.2, 327031.0], [80.3, 327031.0], [80.4, 327031.0], [80.5, 327031.0], [80.6, 327031.0], [80.7, 327031.0], [80.8, 327031.0], [80.9, 327384.0], [81.0, 327384.0], [81.1, 327384.0], [81.2, 327384.0], [81.3, 327384.0], [81.4, 327384.0], [81.5, 327384.0], [81.6, 327384.0], [81.7, 327408.0], [81.8, 327408.0], [81.9, 327408.0], [82.0, 327408.0], [82.1, 327408.0], [82.2, 327408.0], [82.3, 327408.0], [82.4, 327408.0], [82.5, 327479.0], [82.6, 327479.0], [82.7, 327479.0], [82.8, 327479.0], [82.9, 327479.0], [83.0, 327479.0], [83.1, 327479.0], [83.2, 327479.0], [83.3, 327479.0], [83.4, 327828.0], [83.5, 327828.0], [83.6, 327828.0], [83.7, 327828.0], [83.8, 327828.0], [83.9, 327828.0], [84.0, 327828.0], [84.1, 327828.0], [84.2, 327968.0], [84.3, 327968.0], [84.4, 327968.0], [84.5, 327968.0], [84.6, 327968.0], [84.7, 327968.0], [84.8, 327968.0], [84.9, 327968.0], [85.0, 328116.0], [85.1, 328116.0], [85.2, 328116.0], [85.3, 328116.0], [85.4, 328116.0], [85.5, 328116.0], [85.6, 328116.0], [85.7, 328116.0], [85.8, 328116.0], [85.9, 328407.0], [86.0, 328407.0], [86.1, 328407.0], [86.2, 328407.0], [86.3, 328407.0], [86.4, 328407.0], [86.5, 328407.0], [86.6, 328407.0], [86.7, 328533.0], [86.8, 328533.0], [86.9, 328533.0], [87.0, 328533.0], [87.1, 328533.0], [87.2, 328533.0], [87.3, 328533.0], [87.4, 328533.0], [87.5, 329040.0], [87.6, 329040.0], [87.7, 329040.0], [87.8, 329040.0], [87.9, 329040.0], [88.0, 329040.0], [88.1, 329040.0], [88.2, 329040.0], [88.3, 329040.0], [88.4, 329078.0], [88.5, 329078.0], [88.6, 329078.0], [88.7, 329078.0], [88.8, 329078.0], [88.9, 329078.0], [89.0, 329078.0], [89.1, 329078.0], [89.2, 329116.0], [89.3, 329116.0], [89.4, 329116.0], [89.5, 329116.0], [89.6, 329116.0], [89.7, 329116.0], [89.8, 329116.0], [89.9, 329116.0], [90.0, 329649.0], [90.1, 329649.0], [90.2, 329649.0], [90.3, 329649.0], [90.4, 329649.0], [90.5, 329649.0], [90.6, 329649.0], [90.7, 329649.0], [90.8, 329649.0], [90.9, 329923.0], [91.0, 329923.0], [91.1, 329923.0], [91.2, 329923.0], [91.3, 329923.0], [91.4, 329923.0], [91.5, 329923.0], [91.6, 329923.0], [91.7, 330435.0], [91.8, 330435.0], [91.9, 330435.0], [92.0, 330435.0], [92.1, 330435.0], [92.2, 330435.0], [92.3, 330435.0], [92.4, 330435.0], [92.5, 330536.0], [92.6, 330536.0], [92.7, 330536.0], [92.8, 330536.0], [92.9, 330536.0], [93.0, 330536.0], [93.1, 330536.0], [93.2, 330536.0], [93.3, 330536.0], [93.4, 330675.0], [93.5, 330675.0], [93.6, 330675.0], [93.7, 330675.0], [93.8, 330675.0], [93.9, 330675.0], [94.0, 330675.0], [94.1, 330675.0], [94.2, 330852.0], [94.3, 330852.0], [94.4, 330852.0], [94.5, 330852.0], [94.6, 330852.0], [94.7, 330852.0], [94.8, 330852.0], [94.9, 330852.0], [95.0, 332045.0], [95.1, 332045.0], [95.2, 332045.0], [95.3, 332045.0], [95.4, 332045.0], [95.5, 332045.0], [95.6, 332045.0], [95.7, 332045.0], [95.8, 332045.0], [95.9, 332177.0], [96.0, 332177.0], [96.1, 332177.0], [96.2, 332177.0], [96.3, 332177.0], [96.4, 332177.0], [96.5, 332177.0], [96.6, 332177.0], [96.7, 332657.0], [96.8, 332657.0], [96.9, 332657.0], [97.0, 332657.0], [97.1, 332657.0], [97.2, 332657.0], [97.3, 332657.0], [97.4, 332657.0], [97.5, 333707.0], [97.6, 333707.0], [97.7, 333707.0], [97.8, 333707.0], [97.9, 333707.0], [98.0, 333707.0], [98.1, 333707.0], [98.2, 333707.0], [98.3, 333707.0], [98.4, 337268.0], [98.5, 337268.0], [98.6, 337268.0], [98.7, 337268.0], [98.8, 337268.0], [98.9, 337268.0], [99.0, 337268.0], [99.1, 337268.0], [99.2, 339112.0], [99.3, 339112.0], [99.4, 339112.0], [99.5, 339112.0], [99.6, 339112.0], [99.7, 339112.0], [99.8, 339112.0], [99.9, 339112.0]], "isOverall": false, "label": "HTTP Request", "isController": false}], "supportsControllersDiscrimination": true, "maxX": 100.0, "title": "Response Time Percentiles"}},
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
        data: {"result": {"minY": 1.0, "minX": 295600.0, "maxY": 3.0, "series": [{"data": [[314500.0, 1.0], [312900.0, 1.0], [324100.0, 1.0], [316100.0, 1.0], [319300.0, 2.0], [317700.0, 1.0], [322500.0, 2.0], [325700.0, 1.0], [327300.0, 1.0], [333700.0, 1.0], [332100.0, 1.0], [330500.0, 1.0], [312000.0, 1.0], [320000.0, 2.0], [318400.0, 1.0], [329600.0, 1.0], [314700.0, 1.0], [319500.0, 1.0], [317900.0, 1.0], [316300.0, 1.0], [321100.0, 1.0], [322700.0, 1.0], [329100.0, 1.0], [320200.0, 1.0], [321800.0, 1.0], [323400.0, 1.0], [318600.0, 1.0], [305300.0, 1.0], [319700.0, 1.0], [322900.0, 1.0], [306000.0, 1.0], [325200.0, 3.0], [323600.0, 2.0], [318800.0, 1.0], [320400.0, 3.0], [322000.0, 1.0], [328400.0, 1.0], [324700.0, 1.0], [319900.0, 1.0], [321500.0, 2.0], [326300.0, 1.0], [339100.0, 1.0], [327900.0, 1.0], [304600.0, 1.0], [311000.0, 1.0], [323800.0, 2.0], [317400.0, 1.0], [327000.0, 1.0], [322200.0, 1.0], [302500.0, 1.0], [308900.0, 1.0], [318500.0, 1.0], [321700.0, 1.0], [323300.0, 1.0], [324900.0, 2.0], [328100.0, 1.0], [325600.0, 2.0], [332000.0, 1.0], [330400.0, 1.0], [315500.0, 1.0], [326700.0, 1.0], [325100.0, 1.0], [318700.0, 3.0], [323500.0, 1.0], [329900.0, 1.0], [298600.0, 1.0], [301800.0, 1.0], [303400.0, 1.0], [314600.0, 1.0], [324200.0, 3.0], [311400.0, 1.0], [317800.0, 1.0], [327400.0, 2.0], [325800.0, 1.0], [322600.0, 1.0], [330600.0, 1.0], [329000.0, 2.0], [301300.0, 1.0], [317300.0, 1.0], [323700.0, 3.0], [326900.0, 1.0], [328500.0, 1.0], [295600.0, 1.0], [319600.0, 1.0], [326000.0, 1.0], [316400.0, 2.0], [324400.0, 1.0], [322800.0, 2.0], [337200.0, 1.0], [330800.0, 1.0], [315900.0, 1.0], [325500.0, 1.0], [322300.0, 1.0], [323900.0, 1.0], [313400.0, 1.0], [319800.0, 1.0], [327800.0, 1.0], [332600.0, 1.0]], "isOverall": false, "label": "HTTP Request", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 100, "maxX": 339100.0, "title": "Response Time Distribution"}},
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
        data: {"result": {"minY": 30.6, "minX": 1.52074632E12, "maxY": 60.0, "series": [{"data": [[1.52074638E12, 60.0], [1.52074668E12, 30.6], [1.52074632E12, 60.0]], "isOverall": false, "label": "Thread Group", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.52074668E12, "title": "Active Threads Over Time"}},
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
        data: {"result": {"minY": 316852.9180327867, "minX": 1.0, "maxY": 339112.0, "series": [{"data": [[2.0, 324979.0], [6.0, 320118.5], [7.0, 322636.0], [8.0, 323429.0], [9.0, 321725.0], [10.0, 324204.0], [11.0, 322905.0], [12.0, 320447.0], [13.0, 322290.0], [14.0, 325158.0], [15.0, 323380.0], [16.0, 327031.0], [17.0, 323990.0], [18.0, 324467.0], [19.0, 324168.0], [20.0, 327968.0], [21.0, 327479.0], [22.0, 323555.0], [23.0, 325855.0], [24.0, 329040.0], [25.0, 327384.0], [26.0, 329078.0], [27.0, 320488.0], [28.0, 326953.0], [29.0, 330852.0], [30.0, 325608.0], [31.0, 324214.0], [33.0, 326002.0], [32.0, 322543.0], [35.0, 326308.0], [34.0, 332657.0], [37.0, 327828.0], [36.0, 321830.0], [39.0, 322346.0], [38.0, 327408.0], [41.0, 339112.0], [40.0, 325724.0], [43.0, 329649.0], [42.0, 322754.0], [45.0, 329923.0], [44.0, 325648.0], [47.0, 330536.0], [46.0, 330435.0], [49.0, 323769.0], [48.0, 324904.0], [51.0, 317451.0], [50.0, 328407.0], [53.0, 337268.0], [52.0, 332045.0], [55.0, 322852.0], [54.0, 332177.0], [57.0, 325520.0], [56.0, 330675.0], [59.0, 333707.0], [58.0, 329116.0], [60.0, 316852.9180327867], [1.0, 323713.0]], "isOverall": false, "label": "HTTP Request", "isController": false}, {"data": [[45.300000000000004, 321334.09999999986]], "isOverall": false, "label": "HTTP Request-Aggregated", "isController": false}], "supportsControllersDiscrimination": true, "maxX": 60.0, "title": "Time VS Threads"}},
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
        data : {"result": {"minY": 54.6, "minX": 1.52074632E12, "maxY": 43293.0, "series": [{"data": [[1.52074638E12, 24532.7], [1.52074668E12, 43293.0], [1.52074632E12, 18760.3]], "isOverall": false, "label": "Bytes received per second", "isController": false}, {"data": [[1.52074638E12, 71.4], [1.52074668E12, 126.0], [1.52074632E12, 54.6]], "isOverall": false, "label": "Bytes sent per second", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.52074668E12, "title": "Bytes Throughput Over Time"}},
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
        data: {"result": {"minY": 310414.96153846156, "minX": 1.52074632E12, "maxY": 325841.96666666673, "series": [{"data": [[1.52074638E12, 321728.9705882353], [1.52074668E12, 325841.96666666673], [1.52074632E12, 310414.96153846156]], "isOverall": false, "label": "HTTP Request", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.52074668E12, "title": "Response Time Over Time"}},
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
        data: {"result": {"minY": 52847.99999999999, "minX": 1.52074632E12, "maxY": 63137.28333333333, "series": [{"data": [[1.52074638E12, 61336.47058823529], [1.52074668E12, 63137.28333333333], [1.52074632E12, 52847.99999999999]], "isOverall": false, "label": "HTTP Request", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.52074668E12, "title": "Latencies Over Time"}},
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
        data: {"result": {"minY": 7.583333333333334, "minX": 1.52074632E12, "maxY": 10.076923076923078, "series": [{"data": [[1.52074638E12, 8.735294117647058], [1.52074668E12, 7.583333333333334], [1.52074632E12, 10.076923076923078]], "isOverall": false, "label": "HTTP Request", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.52074668E12, "title": "Connect Time Over Time"}},
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
        data: {"result": {"minY": 295607.0, "minX": 1.52074632E12, "maxY": 339112.0, "series": [{"data": [[1.52074638E12, 328533.0], [1.52074668E12, 339112.0], [1.52074632E12, 319598.0]], "isOverall": false, "label": "Max", "isController": false}, {"data": [[1.52074638E12, 316333.0], [1.52074668E12, 316407.0], [1.52074632E12, 295607.0]], "isOverall": false, "label": "Min", "isController": false}, {"data": [[1.52074638E12, 325194.8], [1.52074668E12, 329595.7], [1.52074632E12, 318082.4]], "isOverall": false, "label": "90th percentile", "isController": false}, {"data": [[1.52074638E12, 328533.0], [1.52074668E12, 338724.76], [1.52074632E12, 319598.0]], "isOverall": false, "label": "99th percentile", "isController": false}, {"data": [[1.52074638E12, 326662.7], [1.52074668E12, 331985.35], [1.52074632E12, 319294.9]], "isOverall": false, "label": "95th percentile", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.52074668E12, "title": "Response Time Percentiles Over Time (successful requests only)"}},
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
    data: {"result": {"minY": 318747.0, "minX": 0.0, "maxY": 325339.0, "series": [{"data": [[0.0, 318747.0], [1.0, 325339.0]], "isOverall": false, "label": "Successes", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.0, "title": "Response Time Vs Request"}},
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
    data: {"result": {"minY": 60070.5, "minX": 0.0, "maxY": 63083.5, "series": [{"data": [[0.0, 60070.5], [1.0, 63083.5]], "isOverall": false, "label": "Successes", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.0, "title": "Latencies Vs Request"}},
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
        data: {"result": {"minY": 0.43333333333333335, "minX": 1.52074602E12, "maxY": 1.0, "series": [{"data": [[1.52074638E12, 0.5666666666666667], [1.52074602E12, 1.0], [1.52074632E12, 0.43333333333333335]], "isOverall": false, "label": "hitsPerSecond", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.52074638E12, "title": "Hits Per Second"}},
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
        data: {"result": {"minY": 0.43333333333333335, "minX": 1.52074632E12, "maxY": 1.0, "series": [{"data": [[1.52074638E12, 0.5666666666666667], [1.52074668E12, 1.0], [1.52074632E12, 0.43333333333333335]], "isOverall": false, "label": "200", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.52074668E12, "title": "Codes Per Second"}},
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
        data: {"result": {"minY": 0.43333333333333335, "minX": 1.52074632E12, "maxY": 1.0, "series": [{"data": [[1.52074638E12, 0.5666666666666667], [1.52074668E12, 1.0], [1.52074632E12, 0.43333333333333335]], "isOverall": false, "label": "HTTP Request-success", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.52074668E12, "title": "Transactions Per Second"}},
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
