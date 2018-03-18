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
        data: {"result": {"minY": 238624.0, "minX": 0.0, "maxY": 280728.0, "series": [{"data": [[0.0, 238624.0], [0.1, 238624.0], [0.2, 238624.0], [0.3, 238624.0], [0.4, 238624.0], [0.5, 238624.0], [0.6, 238624.0], [0.7, 238624.0], [0.8, 238624.0], [0.9, 241690.0], [1.0, 241690.0], [1.1, 241690.0], [1.2, 241690.0], [1.3, 241690.0], [1.4, 241690.0], [1.5, 241690.0], [1.6, 241690.0], [1.7, 244678.0], [1.8, 244678.0], [1.9, 244678.0], [2.0, 244678.0], [2.1, 244678.0], [2.2, 244678.0], [2.3, 244678.0], [2.4, 244678.0], [2.5, 247397.0], [2.6, 247397.0], [2.7, 247397.0], [2.8, 247397.0], [2.9, 247397.0], [3.0, 247397.0], [3.1, 247397.0], [3.2, 247397.0], [3.3, 247397.0], [3.4, 251349.0], [3.5, 251349.0], [3.6, 251349.0], [3.7, 251349.0], [3.8, 251349.0], [3.9, 251349.0], [4.0, 251349.0], [4.1, 251349.0], [4.2, 253747.0], [4.3, 253747.0], [4.4, 253747.0], [4.5, 253747.0], [4.6, 253747.0], [4.7, 253747.0], [4.8, 253747.0], [4.9, 253747.0], [5.0, 255351.0], [5.1, 255351.0], [5.2, 255351.0], [5.3, 255351.0], [5.4, 255351.0], [5.5, 255351.0], [5.6, 255351.0], [5.7, 255351.0], [5.8, 255351.0], [5.9, 258719.0], [6.0, 258719.0], [6.1, 258719.0], [6.2, 258719.0], [6.3, 258719.0], [6.4, 258719.0], [6.5, 258719.0], [6.6, 258719.0], [6.7, 260236.0], [6.8, 260236.0], [6.9, 260236.0], [7.0, 260236.0], [7.1, 260236.0], [7.2, 260236.0], [7.3, 260236.0], [7.4, 260236.0], [7.5, 261170.0], [7.6, 261170.0], [7.7, 261170.0], [7.8, 261170.0], [7.9, 261170.0], [8.0, 261170.0], [8.1, 261170.0], [8.2, 261170.0], [8.3, 261170.0], [8.4, 261448.0], [8.5, 261448.0], [8.6, 261448.0], [8.7, 261448.0], [8.8, 261448.0], [8.9, 261448.0], [9.0, 261448.0], [9.1, 261448.0], [9.2, 261811.0], [9.3, 261811.0], [9.4, 261811.0], [9.5, 261811.0], [9.6, 261811.0], [9.7, 261811.0], [9.8, 261811.0], [9.9, 261811.0], [10.0, 262551.0], [10.1, 262551.0], [10.2, 262551.0], [10.3, 262551.0], [10.4, 262551.0], [10.5, 262551.0], [10.6, 262551.0], [10.7, 262551.0], [10.8, 262551.0], [10.9, 262611.0], [11.0, 262611.0], [11.1, 262611.0], [11.2, 262611.0], [11.3, 262611.0], [11.4, 262611.0], [11.5, 262611.0], [11.6, 262611.0], [11.7, 262853.0], [11.8, 262853.0], [11.9, 262853.0], [12.0, 262853.0], [12.1, 262853.0], [12.2, 262853.0], [12.3, 262853.0], [12.4, 262853.0], [12.5, 262853.0], [12.6, 263222.0], [12.7, 263222.0], [12.8, 263222.0], [12.9, 263222.0], [13.0, 263222.0], [13.1, 263222.0], [13.2, 263222.0], [13.3, 263222.0], [13.4, 263737.0], [13.5, 263737.0], [13.6, 263737.0], [13.7, 263737.0], [13.8, 263737.0], [13.9, 263737.0], [14.0, 263737.0], [14.1, 263737.0], [14.2, 263860.0], [14.3, 263860.0], [14.4, 263860.0], [14.5, 263860.0], [14.6, 263860.0], [14.7, 263860.0], [14.8, 263860.0], [14.9, 263860.0], [15.0, 263860.0], [15.1, 264257.0], [15.2, 264257.0], [15.3, 264257.0], [15.4, 264257.0], [15.5, 264257.0], [15.6, 264257.0], [15.7, 264257.0], [15.8, 264257.0], [15.9, 264305.0], [16.0, 264305.0], [16.1, 264305.0], [16.2, 264305.0], [16.3, 264305.0], [16.4, 264305.0], [16.5, 264305.0], [16.6, 264305.0], [16.7, 264390.0], [16.8, 264390.0], [16.9, 264390.0], [17.0, 264390.0], [17.1, 264390.0], [17.2, 264390.0], [17.3, 264390.0], [17.4, 264390.0], [17.5, 264390.0], [17.6, 264876.0], [17.7, 264876.0], [17.8, 264876.0], [17.9, 264876.0], [18.0, 264876.0], [18.1, 264876.0], [18.2, 264876.0], [18.3, 264876.0], [18.4, 265116.0], [18.5, 265116.0], [18.6, 265116.0], [18.7, 265116.0], [18.8, 265116.0], [18.9, 265116.0], [19.0, 265116.0], [19.1, 265116.0], [19.2, 265224.0], [19.3, 265224.0], [19.4, 265224.0], [19.5, 265224.0], [19.6, 265224.0], [19.7, 265224.0], [19.8, 265224.0], [19.9, 265224.0], [20.0, 265315.0], [20.1, 265315.0], [20.2, 265315.0], [20.3, 265315.0], [20.4, 265315.0], [20.5, 265315.0], [20.6, 265315.0], [20.7, 265315.0], [20.8, 265315.0], [20.9, 265316.0], [21.0, 265316.0], [21.1, 265316.0], [21.2, 265316.0], [21.3, 265316.0], [21.4, 265316.0], [21.5, 265316.0], [21.6, 265316.0], [21.7, 265814.0], [21.8, 265814.0], [21.9, 265814.0], [22.0, 265814.0], [22.1, 265814.0], [22.2, 265814.0], [22.3, 265814.0], [22.4, 265814.0], [22.5, 265934.0], [22.6, 265934.0], [22.7, 265934.0], [22.8, 265934.0], [22.9, 265934.0], [23.0, 265934.0], [23.1, 265934.0], [23.2, 265934.0], [23.3, 265934.0], [23.4, 266008.0], [23.5, 266008.0], [23.6, 266008.0], [23.7, 266008.0], [23.8, 266008.0], [23.9, 266008.0], [24.0, 266008.0], [24.1, 266008.0], [24.2, 266038.0], [24.3, 266038.0], [24.4, 266038.0], [24.5, 266038.0], [24.6, 266038.0], [24.7, 266038.0], [24.8, 266038.0], [24.9, 266038.0], [25.0, 266217.0], [25.1, 266217.0], [25.2, 266217.0], [25.3, 266217.0], [25.4, 266217.0], [25.5, 266217.0], [25.6, 266217.0], [25.7, 266217.0], [25.8, 266217.0], [25.9, 266270.0], [26.0, 266270.0], [26.1, 266270.0], [26.2, 266270.0], [26.3, 266270.0], [26.4, 266270.0], [26.5, 266270.0], [26.6, 266270.0], [26.7, 266390.0], [26.8, 266390.0], [26.9, 266390.0], [27.0, 266390.0], [27.1, 266390.0], [27.2, 266390.0], [27.3, 266390.0], [27.4, 266390.0], [27.5, 266440.0], [27.6, 266440.0], [27.7, 266440.0], [27.8, 266440.0], [27.9, 266440.0], [28.0, 266440.0], [28.1, 266440.0], [28.2, 266440.0], [28.3, 266440.0], [28.4, 266524.0], [28.5, 266524.0], [28.6, 266524.0], [28.7, 266524.0], [28.8, 266524.0], [28.9, 266524.0], [29.0, 266524.0], [29.1, 266524.0], [29.2, 266536.0], [29.3, 266536.0], [29.4, 266536.0], [29.5, 266536.0], [29.6, 266536.0], [29.7, 266536.0], [29.8, 266536.0], [29.9, 266536.0], [30.0, 266576.0], [30.1, 266576.0], [30.2, 266576.0], [30.3, 266576.0], [30.4, 266576.0], [30.5, 266576.0], [30.6, 266576.0], [30.7, 266576.0], [30.8, 266576.0], [30.9, 266862.0], [31.0, 266862.0], [31.1, 266862.0], [31.2, 266862.0], [31.3, 266862.0], [31.4, 266862.0], [31.5, 266862.0], [31.6, 266862.0], [31.7, 266931.0], [31.8, 266931.0], [31.9, 266931.0], [32.0, 266931.0], [32.1, 266931.0], [32.2, 266931.0], [32.3, 266931.0], [32.4, 266931.0], [32.5, 267172.0], [32.6, 267172.0], [32.7, 267172.0], [32.8, 267172.0], [32.9, 267172.0], [33.0, 267172.0], [33.1, 267172.0], [33.2, 267172.0], [33.3, 267172.0], [33.4, 267286.0], [33.5, 267286.0], [33.6, 267286.0], [33.7, 267286.0], [33.8, 267286.0], [33.9, 267286.0], [34.0, 267286.0], [34.1, 267286.0], [34.2, 267498.0], [34.3, 267498.0], [34.4, 267498.0], [34.5, 267498.0], [34.6, 267498.0], [34.7, 267498.0], [34.8, 267498.0], [34.9, 267498.0], [35.0, 267521.0], [35.1, 267521.0], [35.2, 267521.0], [35.3, 267521.0], [35.4, 267521.0], [35.5, 267521.0], [35.6, 267521.0], [35.7, 267521.0], [35.8, 267521.0], [35.9, 267568.0], [36.0, 267568.0], [36.1, 267568.0], [36.2, 267568.0], [36.3, 267568.0], [36.4, 267568.0], [36.5, 267568.0], [36.6, 267568.0], [36.7, 267580.0], [36.8, 267580.0], [36.9, 267580.0], [37.0, 267580.0], [37.1, 267580.0], [37.2, 267580.0], [37.3, 267580.0], [37.4, 267580.0], [37.5, 267724.0], [37.6, 267724.0], [37.7, 267724.0], [37.8, 267724.0], [37.9, 267724.0], [38.0, 267724.0], [38.1, 267724.0], [38.2, 267724.0], [38.3, 267724.0], [38.4, 267810.0], [38.5, 267810.0], [38.6, 267810.0], [38.7, 267810.0], [38.8, 267810.0], [38.9, 267810.0], [39.0, 267810.0], [39.1, 267810.0], [39.2, 267873.0], [39.3, 267873.0], [39.4, 267873.0], [39.5, 267873.0], [39.6, 267873.0], [39.7, 267873.0], [39.8, 267873.0], [39.9, 267873.0], [40.0, 267873.0], [40.1, 267944.0], [40.2, 267944.0], [40.3, 267944.0], [40.4, 267944.0], [40.5, 267944.0], [40.6, 267944.0], [40.7, 267944.0], [40.8, 267944.0], [40.9, 268136.0], [41.0, 268136.0], [41.1, 268136.0], [41.2, 268136.0], [41.3, 268136.0], [41.4, 268136.0], [41.5, 268136.0], [41.6, 268136.0], [41.7, 268487.0], [41.8, 268487.0], [41.9, 268487.0], [42.0, 268487.0], [42.1, 268487.0], [42.2, 268487.0], [42.3, 268487.0], [42.4, 268487.0], [42.5, 268487.0], [42.6, 268640.0], [42.7, 268640.0], [42.8, 268640.0], [42.9, 268640.0], [43.0, 268640.0], [43.1, 268640.0], [43.2, 268640.0], [43.3, 268640.0], [43.4, 268797.0], [43.5, 268797.0], [43.6, 268797.0], [43.7, 268797.0], [43.8, 268797.0], [43.9, 268797.0], [44.0, 268797.0], [44.1, 268797.0], [44.2, 268885.0], [44.3, 268885.0], [44.4, 268885.0], [44.5, 268885.0], [44.6, 268885.0], [44.7, 268885.0], [44.8, 268885.0], [44.9, 268885.0], [45.0, 268885.0], [45.1, 268991.0], [45.2, 268991.0], [45.3, 268991.0], [45.4, 268991.0], [45.5, 268991.0], [45.6, 268991.0], [45.7, 268991.0], [45.8, 268991.0], [45.9, 269000.0], [46.0, 269000.0], [46.1, 269000.0], [46.2, 269000.0], [46.3, 269000.0], [46.4, 269000.0], [46.5, 269000.0], [46.6, 269000.0], [46.7, 269019.0], [46.8, 269019.0], [46.9, 269019.0], [47.0, 269019.0], [47.1, 269019.0], [47.2, 269019.0], [47.3, 269019.0], [47.4, 269019.0], [47.5, 269019.0], [47.6, 269311.0], [47.7, 269311.0], [47.8, 269311.0], [47.9, 269311.0], [48.0, 269311.0], [48.1, 269311.0], [48.2, 269311.0], [48.3, 269311.0], [48.4, 269346.0], [48.5, 269346.0], [48.6, 269346.0], [48.7, 269346.0], [48.8, 269346.0], [48.9, 269346.0], [49.0, 269346.0], [49.1, 269346.0], [49.2, 269365.0], [49.3, 269365.0], [49.4, 269365.0], [49.5, 269365.0], [49.6, 269365.0], [49.7, 269365.0], [49.8, 269365.0], [49.9, 269365.0], [50.0, 269365.0], [50.1, 269481.0], [50.2, 269481.0], [50.3, 269481.0], [50.4, 269481.0], [50.5, 269481.0], [50.6, 269481.0], [50.7, 269481.0], [50.8, 269481.0], [50.9, 269509.0], [51.0, 269509.0], [51.1, 269509.0], [51.2, 269509.0], [51.3, 269509.0], [51.4, 269509.0], [51.5, 269509.0], [51.6, 269509.0], [51.7, 269658.0], [51.8, 269658.0], [51.9, 269658.0], [52.0, 269658.0], [52.1, 269658.0], [52.2, 269658.0], [52.3, 269658.0], [52.4, 269658.0], [52.5, 269658.0], [52.6, 269729.0], [52.7, 269729.0], [52.8, 269729.0], [52.9, 269729.0], [53.0, 269729.0], [53.1, 269729.0], [53.2, 269729.0], [53.3, 269729.0], [53.4, 269847.0], [53.5, 269847.0], [53.6, 269847.0], [53.7, 269847.0], [53.8, 269847.0], [53.9, 269847.0], [54.0, 269847.0], [54.1, 269847.0], [54.2, 269867.0], [54.3, 269867.0], [54.4, 269867.0], [54.5, 269867.0], [54.6, 269867.0], [54.7, 269867.0], [54.8, 269867.0], [54.9, 269867.0], [55.0, 269867.0], [55.1, 270370.0], [55.2, 270370.0], [55.3, 270370.0], [55.4, 270370.0], [55.5, 270370.0], [55.6, 270370.0], [55.7, 270370.0], [55.8, 270370.0], [55.9, 270387.0], [56.0, 270387.0], [56.1, 270387.0], [56.2, 270387.0], [56.3, 270387.0], [56.4, 270387.0], [56.5, 270387.0], [56.6, 270387.0], [56.7, 270443.0], [56.8, 270443.0], [56.9, 270443.0], [57.0, 270443.0], [57.1, 270443.0], [57.2, 270443.0], [57.3, 270443.0], [57.4, 270443.0], [57.5, 270443.0], [57.6, 270477.0], [57.7, 270477.0], [57.8, 270477.0], [57.9, 270477.0], [58.0, 270477.0], [58.1, 270477.0], [58.2, 270477.0], [58.3, 270477.0], [58.4, 270720.0], [58.5, 270720.0], [58.6, 270720.0], [58.7, 270720.0], [58.8, 270720.0], [58.9, 270720.0], [59.0, 270720.0], [59.1, 270720.0], [59.2, 270807.0], [59.3, 270807.0], [59.4, 270807.0], [59.5, 270807.0], [59.6, 270807.0], [59.7, 270807.0], [59.8, 270807.0], [59.9, 270807.0], [60.0, 270807.0], [60.1, 270843.0], [60.2, 270843.0], [60.3, 270843.0], [60.4, 270843.0], [60.5, 270843.0], [60.6, 270843.0], [60.7, 270843.0], [60.8, 270843.0], [60.9, 270941.0], [61.0, 270941.0], [61.1, 270941.0], [61.2, 270941.0], [61.3, 270941.0], [61.4, 270941.0], [61.5, 270941.0], [61.6, 270941.0], [61.7, 271341.0], [61.8, 271341.0], [61.9, 271341.0], [62.0, 271341.0], [62.1, 271341.0], [62.2, 271341.0], [62.3, 271341.0], [62.4, 271341.0], [62.5, 271341.0], [62.6, 271550.0], [62.7, 271550.0], [62.8, 271550.0], [62.9, 271550.0], [63.0, 271550.0], [63.1, 271550.0], [63.2, 271550.0], [63.3, 271550.0], [63.4, 271853.0], [63.5, 271853.0], [63.6, 271853.0], [63.7, 271853.0], [63.8, 271853.0], [63.9, 271853.0], [64.0, 271853.0], [64.1, 271853.0], [64.2, 272039.0], [64.3, 272039.0], [64.4, 272039.0], [64.5, 272039.0], [64.6, 272039.0], [64.7, 272039.0], [64.8, 272039.0], [64.9, 272039.0], [65.0, 272039.0], [65.1, 272108.0], [65.2, 272108.0], [65.3, 272108.0], [65.4, 272108.0], [65.5, 272108.0], [65.6, 272108.0], [65.7, 272108.0], [65.8, 272108.0], [65.9, 272262.0], [66.0, 272262.0], [66.1, 272262.0], [66.2, 272262.0], [66.3, 272262.0], [66.4, 272262.0], [66.5, 272262.0], [66.6, 272262.0], [66.7, 272324.0], [66.8, 272324.0], [66.9, 272324.0], [67.0, 272324.0], [67.1, 272324.0], [67.2, 272324.0], [67.3, 272324.0], [67.4, 272324.0], [67.5, 272324.0], [67.6, 272440.0], [67.7, 272440.0], [67.8, 272440.0], [67.9, 272440.0], [68.0, 272440.0], [68.1, 272440.0], [68.2, 272440.0], [68.3, 272440.0], [68.4, 272557.0], [68.5, 272557.0], [68.6, 272557.0], [68.7, 272557.0], [68.8, 272557.0], [68.9, 272557.0], [69.0, 272557.0], [69.1, 272557.0], [69.2, 272698.0], [69.3, 272698.0], [69.4, 272698.0], [69.5, 272698.0], [69.6, 272698.0], [69.7, 272698.0], [69.8, 272698.0], [69.9, 272698.0], [70.0, 272698.0], [70.1, 272858.0], [70.2, 272858.0], [70.3, 272858.0], [70.4, 272858.0], [70.5, 272858.0], [70.6, 272858.0], [70.7, 272858.0], [70.8, 272858.0], [70.9, 273225.0], [71.0, 273225.0], [71.1, 273225.0], [71.2, 273225.0], [71.3, 273225.0], [71.4, 273225.0], [71.5, 273225.0], [71.6, 273225.0], [71.7, 273368.0], [71.8, 273368.0], [71.9, 273368.0], [72.0, 273368.0], [72.1, 273368.0], [72.2, 273368.0], [72.3, 273368.0], [72.4, 273368.0], [72.5, 273368.0], [72.6, 273643.0], [72.7, 273643.0], [72.8, 273643.0], [72.9, 273643.0], [73.0, 273643.0], [73.1, 273643.0], [73.2, 273643.0], [73.3, 273643.0], [73.4, 273693.0], [73.5, 273693.0], [73.6, 273693.0], [73.7, 273693.0], [73.8, 273693.0], [73.9, 273693.0], [74.0, 273693.0], [74.1, 273693.0], [74.2, 273830.0], [74.3, 273830.0], [74.4, 273830.0], [74.5, 273830.0], [74.6, 273830.0], [74.7, 273830.0], [74.8, 273830.0], [74.9, 273830.0], [75.0, 273830.0], [75.1, 273906.0], [75.2, 273906.0], [75.3, 273906.0], [75.4, 273906.0], [75.5, 273906.0], [75.6, 273906.0], [75.7, 273906.0], [75.8, 273906.0], [75.9, 274059.0], [76.0, 274059.0], [76.1, 274059.0], [76.2, 274059.0], [76.3, 274059.0], [76.4, 274059.0], [76.5, 274059.0], [76.6, 274059.0], [76.7, 274063.0], [76.8, 274063.0], [76.9, 274063.0], [77.0, 274063.0], [77.1, 274063.0], [77.2, 274063.0], [77.3, 274063.0], [77.4, 274063.0], [77.5, 274297.0], [77.6, 274297.0], [77.7, 274297.0], [77.8, 274297.0], [77.9, 274297.0], [78.0, 274297.0], [78.1, 274297.0], [78.2, 274297.0], [78.3, 274297.0], [78.4, 274314.0], [78.5, 274314.0], [78.6, 274314.0], [78.7, 274314.0], [78.8, 274314.0], [78.9, 274314.0], [79.0, 274314.0], [79.1, 274314.0], [79.2, 274362.0], [79.3, 274362.0], [79.4, 274362.0], [79.5, 274362.0], [79.6, 274362.0], [79.7, 274362.0], [79.8, 274362.0], [79.9, 274362.0], [80.0, 274844.0], [80.1, 274844.0], [80.2, 274844.0], [80.3, 274844.0], [80.4, 274844.0], [80.5, 274844.0], [80.6, 274844.0], [80.7, 274844.0], [80.8, 274844.0], [80.9, 274885.0], [81.0, 274885.0], [81.1, 274885.0], [81.2, 274885.0], [81.3, 274885.0], [81.4, 274885.0], [81.5, 274885.0], [81.6, 274885.0], [81.7, 274918.0], [81.8, 274918.0], [81.9, 274918.0], [82.0, 274918.0], [82.1, 274918.0], [82.2, 274918.0], [82.3, 274918.0], [82.4, 274918.0], [82.5, 275076.0], [82.6, 275076.0], [82.7, 275076.0], [82.8, 275076.0], [82.9, 275076.0], [83.0, 275076.0], [83.1, 275076.0], [83.2, 275076.0], [83.3, 275076.0], [83.4, 275088.0], [83.5, 275088.0], [83.6, 275088.0], [83.7, 275088.0], [83.8, 275088.0], [83.9, 275088.0], [84.0, 275088.0], [84.1, 275088.0], [84.2, 275114.0], [84.3, 275114.0], [84.4, 275114.0], [84.5, 275114.0], [84.6, 275114.0], [84.7, 275114.0], [84.8, 275114.0], [84.9, 275114.0], [85.0, 275179.0], [85.1, 275179.0], [85.2, 275179.0], [85.3, 275179.0], [85.4, 275179.0], [85.5, 275179.0], [85.6, 275179.0], [85.7, 275179.0], [85.8, 275179.0], [85.9, 275425.0], [86.0, 275425.0], [86.1, 275425.0], [86.2, 275425.0], [86.3, 275425.0], [86.4, 275425.0], [86.5, 275425.0], [86.6, 275425.0], [86.7, 275627.0], [86.8, 275627.0], [86.9, 275627.0], [87.0, 275627.0], [87.1, 275627.0], [87.2, 275627.0], [87.3, 275627.0], [87.4, 275627.0], [87.5, 275628.0], [87.6, 275628.0], [87.7, 275628.0], [87.8, 275628.0], [87.9, 275628.0], [88.0, 275628.0], [88.1, 275628.0], [88.2, 275628.0], [88.3, 275628.0], [88.4, 275683.0], [88.5, 275683.0], [88.6, 275683.0], [88.7, 275683.0], [88.8, 275683.0], [88.9, 275683.0], [89.0, 275683.0], [89.1, 275683.0], [89.2, 275856.0], [89.3, 275856.0], [89.4, 275856.0], [89.5, 275856.0], [89.6, 275856.0], [89.7, 275856.0], [89.8, 275856.0], [89.9, 275856.0], [90.0, 275858.0], [90.1, 275858.0], [90.2, 275858.0], [90.3, 275858.0], [90.4, 275858.0], [90.5, 275858.0], [90.6, 275858.0], [90.7, 275858.0], [90.8, 275858.0], [90.9, 275920.0], [91.0, 275920.0], [91.1, 275920.0], [91.2, 275920.0], [91.3, 275920.0], [91.4, 275920.0], [91.5, 275920.0], [91.6, 275920.0], [91.7, 275930.0], [91.8, 275930.0], [91.9, 275930.0], [92.0, 275930.0], [92.1, 275930.0], [92.2, 275930.0], [92.3, 275930.0], [92.4, 275930.0], [92.5, 276352.0], [92.6, 276352.0], [92.7, 276352.0], [92.8, 276352.0], [92.9, 276352.0], [93.0, 276352.0], [93.1, 276352.0], [93.2, 276352.0], [93.3, 276352.0], [93.4, 277149.0], [93.5, 277149.0], [93.6, 277149.0], [93.7, 277149.0], [93.8, 277149.0], [93.9, 277149.0], [94.0, 277149.0], [94.1, 277149.0], [94.2, 277187.0], [94.3, 277187.0], [94.4, 277187.0], [94.5, 277187.0], [94.6, 277187.0], [94.7, 277187.0], [94.8, 277187.0], [94.9, 277187.0], [95.0, 277525.0], [95.1, 277525.0], [95.2, 277525.0], [95.3, 277525.0], [95.4, 277525.0], [95.5, 277525.0], [95.6, 277525.0], [95.7, 277525.0], [95.8, 277525.0], [95.9, 277867.0], [96.0, 277867.0], [96.1, 277867.0], [96.2, 277867.0], [96.3, 277867.0], [96.4, 277867.0], [96.5, 277867.0], [96.6, 277867.0], [96.7, 278508.0], [96.8, 278508.0], [96.9, 278508.0], [97.0, 278508.0], [97.1, 278508.0], [97.2, 278508.0], [97.3, 278508.0], [97.4, 278508.0], [97.5, 279254.0], [97.6, 279254.0], [97.7, 279254.0], [97.8, 279254.0], [97.9, 279254.0], [98.0, 279254.0], [98.1, 279254.0], [98.2, 279254.0], [98.3, 279254.0], [98.4, 280060.0], [98.5, 280060.0], [98.6, 280060.0], [98.7, 280060.0], [98.8, 280060.0], [98.9, 280060.0], [99.0, 280060.0], [99.1, 280060.0], [99.2, 280728.0], [99.3, 280728.0], [99.4, 280728.0], [99.5, 280728.0], [99.6, 280728.0], [99.7, 280728.0], [99.8, 280728.0], [99.9, 280728.0]], "isOverall": false, "label": "HTTP Request", "isController": false}], "supportsControllersDiscrimination": true, "maxX": 100.0, "title": "Response Time Percentiles"}},
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
        data: {"result": {"minY": 1.0, "minX": 238600.0, "maxY": 3.0, "series": [{"data": [[268900.0, 1.0], [271300.0, 1.0], [278500.0, 1.0], [272100.0, 1.0], [266500.0, 3.0], [268100.0, 1.0], [269700.0, 1.0], [262500.0, 1.0], [241600.0, 1.0], [270400.0, 2.0], [263200.0, 1.0], [273600.0, 2.0], [272800.0, 1.0], [272000.0, 1.0], [267200.0, 1.0], [266400.0, 1.0], [269600.0, 1.0], [264800.0, 1.0], [268800.0, 1.0], [280000.0, 1.0], [279200.0, 1.0], [276300.0, 1.0], [265900.0, 1.0], [273900.0, 1.0], [277100.0, 2.0], [267500.0, 3.0], [264300.0, 2.0], [272300.0, 1.0], [271500.0, 1.0], [270700.0, 1.0], [265100.0, 1.0], [247300.0, 1.0], [251300.0, 1.0], [253700.0, 1.0], [255300.0, 1.0], [265800.0, 1.0], [277800.0, 1.0], [267400.0, 1.0], [269800.0, 2.0], [273800.0, 1.0], [272200.0, 1.0], [275400.0, 1.0], [264200.0, 1.0], [262600.0, 1.0], [269000.0, 2.0], [265300.0, 2.0], [274900.0, 1.0], [263700.0, 1.0], [269300.0, 3.0], [272500.0, 1.0], [270900.0, 1.0], [273300.0, 1.0], [267700.0, 1.0], [266900.0, 1.0], [238600.0, 1.0], [244600.0, 1.0], [260200.0, 1.0], [261800.0, 1.0], [261400.0, 1.0], [275600.0, 3.0], [272400.0, 1.0], [270800.0, 2.0], [274000.0, 2.0], [273200.0, 1.0], [274800.0, 2.0], [266800.0, 1.0], [266000.0, 2.0], [268400.0, 1.0], [265200.0, 1.0], [262800.0, 1.0], [269500.0, 1.0], [275100.0, 2.0], [270300.0, 2.0], [274300.0, 2.0], [275900.0, 2.0], [277500.0, 1.0], [267100.0, 1.0], [267900.0, 1.0], [268700.0, 1.0], [266300.0, 1.0], [280700.0, 1.0], [261100.0, 1.0], [258700.0, 1.0], [263800.0, 1.0], [275000.0, 2.0], [269400.0, 1.0], [267800.0, 2.0], [271800.0, 1.0], [274200.0, 1.0], [272600.0, 1.0], [275800.0, 2.0], [266200.0, 2.0], [268600.0, 1.0]], "isOverall": false, "label": "HTTP Request", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 100, "maxX": 280700.0, "title": "Response Time Distribution"}},
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
        data: {"result": {"minY": 27.555555555555546, "minX": 1.52080728E12, "maxY": 60.0, "series": [{"data": [[1.52080758E12, 27.555555555555546], [1.52080752E12, 57.5], [1.52080728E12, 60.0]], "isOverall": false, "label": "Thread Group", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.52080758E12, "title": "Active Threads Over Time"}},
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
        data: {"result": {"minY": 258719.0, "minX": 1.0, "maxY": 279254.0, "series": [{"data": [[2.0, 258719.0], [3.0, 262551.0], [5.0, 264688.5], [6.0, 261448.0], [7.0, 264305.0], [8.0, 264390.0], [9.0, 269019.0], [10.0, 267521.0], [11.0, 269729.0], [12.0, 266440.0], [13.0, 261170.0], [14.0, 266576.0], [15.0, 269000.0], [16.0, 265224.0], [18.0, 267056.0], [19.0, 267568.0], [20.0, 266390.0], [22.0, 267908.0], [23.0, 265116.0], [24.0, 267944.0], [25.0, 266008.0], [26.0, 268136.0], [27.0, 269311.0], [28.0, 267172.0], [29.0, 268487.0], [30.0, 269509.0], [31.0, 264257.0], [33.0, 269365.0], [32.0, 266536.0], [35.0, 267873.0], [34.0, 264876.0], [37.0, 269847.0], [36.0, 266038.0], [39.0, 270720.0], [38.0, 266270.0], [41.0, 270843.0], [40.0, 270370.0], [43.0, 271550.0], [42.0, 266862.0], [45.0, 269658.0], [44.0, 267724.0], [47.0, 274063.0], [46.0, 273368.0], [49.0, 268640.0], [48.0, 272698.0], [51.0, 266217.0], [50.0, 267286.0], [53.0, 277149.0], [52.0, 272324.0], [55.0, 275076.0], [54.0, 267580.0], [57.0, 279254.0], [56.0, 275628.0], [59.0, 275858.0], [58.0, 275856.0], [60.0, 269318.70491803274], [1.0, 262611.0]], "isOverall": false, "label": "HTTP Request", "isController": false}, {"data": [[45.275, 268798.9666666666]], "isOverall": false, "label": "HTTP Request-Aggregated", "isController": false}], "supportsControllersDiscrimination": true, "maxX": 60.0, "title": "Time VS Threads"}},
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
        data : {"result": {"minY": 16.2, "minX": 1.52080728E12, "maxY": 43293.0, "series": [{"data": [[1.52080758E12, 38963.7], [1.52080752E12, 4329.3], [1.52080728E12, 43293.0]], "isOverall": false, "label": "Bytes received per second", "isController": false}, {"data": [[1.52080758E12, 145.8], [1.52080752E12, 16.2], [1.52080728E12, 162.0]], "isOverall": false, "label": "Bytes sent per second", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.52080758E12, "title": "Bytes Throughput Over Time"}},
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
        data: {"result": {"minY": 267514.12962962966, "minX": 1.52080728E12, "maxY": 276182.8333333334, "series": [{"data": [[1.52080758E12, 267514.12962962966], [1.52080752E12, 276182.8333333334], [1.52080728E12, 269216.9333333333]], "isOverall": false, "label": "HTTP Request", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.52080758E12, "title": "Response Time Over Time"}},
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
        data: {"result": {"minY": 48313.38333333333, "minX": 1.52080728E12, "maxY": 53361.166666666664, "series": [{"data": [[1.52080758E12, 53131.85185185185], [1.52080752E12, 53361.166666666664], [1.52080728E12, 48313.38333333333]], "isOverall": false, "label": "HTTP Request", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.52080758E12, "title": "Latencies Over Time"}},
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
        data: {"result": {"minY": 11.833333333333334, "minX": 1.52080728E12, "maxY": 13.816666666666666, "series": [{"data": [[1.52080758E12, 11.833333333333334], [1.52080752E12, 12.0], [1.52080728E12, 13.816666666666666]], "isOverall": false, "label": "HTTP Request", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.52080758E12, "title": "Connect Time Over Time"}},
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
        data: {"result": {"minY": 238624.0, "minX": 1.52080728E12, "maxY": 280728.0, "series": [{"data": [[1.52080758E12, 277149.0], [1.52080752E12, 279254.0], [1.52080728E12, 280728.0]], "isOverall": false, "label": "Max", "isController": false}, {"data": [[1.52080758E12, 258719.0], [1.52080752E12, 275076.0], [1.52080728E12, 238624.0]], "isOverall": false, "label": "Min", "isController": false}, {"data": [[1.52080758E12, 275857.8], [1.52080752E12, 277288.4], [1.52080728E12, 277103.5]], "isOverall": false, "label": "90th percentile", "isController": false}, {"data": [[1.52080758E12, 280587.72], [1.52080752E12, 280728.0], [1.52080728E12, 280728.0]], "isOverall": false, "label": "99th percentile", "isController": false}, {"data": [[1.52080758E12, 277508.1], [1.52080752E12, 278992.9], [1.52080728E12, 278475.95]], "isOverall": false, "label": "95th percentile", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.52080758E12, "title": "Response Time Percentiles Over Time (successful requests only)"}},
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
    data: {"result": {"minY": 267798.5, "minX": 0.0, "maxY": 272185.0, "series": [{"data": [[1.0, 272185.0], [0.0, 267798.5]], "isOverall": false, "label": "Successes", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.0, "title": "Response Time Vs Request"}},
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
    data: {"result": {"minY": 51308.5, "minX": 0.0, "maxY": 53078.5, "series": [{"data": [[1.0, 51308.5], [0.0, 53078.5]], "isOverall": false, "label": "Successes", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.0, "title": "Latencies Vs Request"}},
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
        data: {"result": {"minY": 1.0, "minX": 1.52080704E12, "maxY": 1.0, "series": [{"data": [[1.52080704E12, 1.0], [1.52080728E12, 1.0]], "isOverall": false, "label": "hitsPerSecond", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.52080728E12, "title": "Hits Per Second"}},
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
        data: {"result": {"minY": 0.1, "minX": 1.52080728E12, "maxY": 1.0, "series": [{"data": [[1.52080758E12, 0.9], [1.52080752E12, 0.1], [1.52080728E12, 1.0]], "isOverall": false, "label": "200", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.52080758E12, "title": "Codes Per Second"}},
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
        data: {"result": {"minY": 0.1, "minX": 1.52080728E12, "maxY": 1.0, "series": [{"data": [[1.52080758E12, 0.9], [1.52080752E12, 0.1], [1.52080728E12, 1.0]], "isOverall": false, "label": "HTTP Request-success", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.52080758E12, "title": "Transactions Per Second"}},
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
