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
        data: {"result": {"minY": 208832.0, "minX": 0.0, "maxY": 241014.0, "series": [{"data": [[0.0, 208832.0], [0.1, 208832.0], [0.2, 208832.0], [0.3, 208832.0], [0.4, 208832.0], [0.5, 208832.0], [0.6, 208832.0], [0.7, 208832.0], [0.8, 208832.0], [0.9, 210344.0], [1.0, 210344.0], [1.1, 210344.0], [1.2, 210344.0], [1.3, 210344.0], [1.4, 210344.0], [1.5, 210344.0], [1.6, 210344.0], [1.7, 211845.0], [1.8, 211845.0], [1.9, 211845.0], [2.0, 211845.0], [2.1, 211845.0], [2.2, 211845.0], [2.3, 211845.0], [2.4, 211845.0], [2.5, 212125.0], [2.6, 212125.0], [2.7, 212125.0], [2.8, 212125.0], [2.9, 212125.0], [3.0, 212125.0], [3.1, 212125.0], [3.2, 212125.0], [3.3, 212125.0], [3.4, 213830.0], [3.5, 213830.0], [3.6, 213830.0], [3.7, 213830.0], [3.8, 213830.0], [3.9, 213830.0], [4.0, 213830.0], [4.1, 213830.0], [4.2, 220273.0], [4.3, 220273.0], [4.4, 220273.0], [4.5, 220273.0], [4.6, 220273.0], [4.7, 220273.0], [4.8, 220273.0], [4.9, 220273.0], [5.0, 223315.0], [5.1, 223315.0], [5.2, 223315.0], [5.3, 223315.0], [5.4, 223315.0], [5.5, 223315.0], [5.6, 223315.0], [5.7, 223315.0], [5.8, 223315.0], [5.9, 223920.0], [6.0, 223920.0], [6.1, 223920.0], [6.2, 223920.0], [6.3, 223920.0], [6.4, 223920.0], [6.5, 223920.0], [6.6, 223920.0], [6.7, 224118.0], [6.8, 224118.0], [6.9, 224118.0], [7.0, 224118.0], [7.1, 224118.0], [7.2, 224118.0], [7.3, 224118.0], [7.4, 224118.0], [7.5, 224373.0], [7.6, 224373.0], [7.7, 224373.0], [7.8, 224373.0], [7.9, 224373.0], [8.0, 224373.0], [8.1, 224373.0], [8.2, 224373.0], [8.3, 224373.0], [8.4, 224468.0], [8.5, 224468.0], [8.6, 224468.0], [8.7, 224468.0], [8.8, 224468.0], [8.9, 224468.0], [9.0, 224468.0], [9.1, 224468.0], [9.2, 225388.0], [9.3, 225388.0], [9.4, 225388.0], [9.5, 225388.0], [9.6, 225388.0], [9.7, 225388.0], [9.8, 225388.0], [9.9, 225388.0], [10.0, 225629.0], [10.1, 225629.0], [10.2, 225629.0], [10.3, 225629.0], [10.4, 225629.0], [10.5, 225629.0], [10.6, 225629.0], [10.7, 225629.0], [10.8, 225629.0], [10.9, 225772.0], [11.0, 225772.0], [11.1, 225772.0], [11.2, 225772.0], [11.3, 225772.0], [11.4, 225772.0], [11.5, 225772.0], [11.6, 225772.0], [11.7, 226156.0], [11.8, 226156.0], [11.9, 226156.0], [12.0, 226156.0], [12.1, 226156.0], [12.2, 226156.0], [12.3, 226156.0], [12.4, 226156.0], [12.5, 226156.0], [12.6, 226390.0], [12.7, 226390.0], [12.8, 226390.0], [12.9, 226390.0], [13.0, 226390.0], [13.1, 226390.0], [13.2, 226390.0], [13.3, 226390.0], [13.4, 226530.0], [13.5, 226530.0], [13.6, 226530.0], [13.7, 226530.0], [13.8, 226530.0], [13.9, 226530.0], [14.0, 226530.0], [14.1, 226530.0], [14.2, 226725.0], [14.3, 226725.0], [14.4, 226725.0], [14.5, 226725.0], [14.6, 226725.0], [14.7, 226725.0], [14.8, 226725.0], [14.9, 226725.0], [15.0, 226725.0], [15.1, 226846.0], [15.2, 226846.0], [15.3, 226846.0], [15.4, 226846.0], [15.5, 226846.0], [15.6, 226846.0], [15.7, 226846.0], [15.8, 226846.0], [15.9, 227039.0], [16.0, 227039.0], [16.1, 227039.0], [16.2, 227039.0], [16.3, 227039.0], [16.4, 227039.0], [16.5, 227039.0], [16.6, 227039.0], [16.7, 227238.0], [16.8, 227238.0], [16.9, 227238.0], [17.0, 227238.0], [17.1, 227238.0], [17.2, 227238.0], [17.3, 227238.0], [17.4, 227238.0], [17.5, 227238.0], [17.6, 227262.0], [17.7, 227262.0], [17.8, 227262.0], [17.9, 227262.0], [18.0, 227262.0], [18.1, 227262.0], [18.2, 227262.0], [18.3, 227262.0], [18.4, 227322.0], [18.5, 227322.0], [18.6, 227322.0], [18.7, 227322.0], [18.8, 227322.0], [18.9, 227322.0], [19.0, 227322.0], [19.1, 227322.0], [19.2, 227495.0], [19.3, 227495.0], [19.4, 227495.0], [19.5, 227495.0], [19.6, 227495.0], [19.7, 227495.0], [19.8, 227495.0], [19.9, 227495.0], [20.0, 227496.0], [20.1, 227496.0], [20.2, 227496.0], [20.3, 227496.0], [20.4, 227496.0], [20.5, 227496.0], [20.6, 227496.0], [20.7, 227496.0], [20.8, 227496.0], [20.9, 227815.0], [21.0, 227815.0], [21.1, 227815.0], [21.2, 227815.0], [21.3, 227815.0], [21.4, 227815.0], [21.5, 227815.0], [21.6, 227815.0], [21.7, 227833.0], [21.8, 227833.0], [21.9, 227833.0], [22.0, 227833.0], [22.1, 227833.0], [22.2, 227833.0], [22.3, 227833.0], [22.4, 227833.0], [22.5, 228364.0], [22.6, 228364.0], [22.7, 228364.0], [22.8, 228364.0], [22.9, 228364.0], [23.0, 228364.0], [23.1, 228364.0], [23.2, 228364.0], [23.3, 228364.0], [23.4, 228424.0], [23.5, 228424.0], [23.6, 228424.0], [23.7, 228424.0], [23.8, 228424.0], [23.9, 228424.0], [24.0, 228424.0], [24.1, 228424.0], [24.2, 228464.0], [24.3, 228464.0], [24.4, 228464.0], [24.5, 228464.0], [24.6, 228464.0], [24.7, 228464.0], [24.8, 228464.0], [24.9, 228464.0], [25.0, 228487.0], [25.1, 228487.0], [25.2, 228487.0], [25.3, 228487.0], [25.4, 228487.0], [25.5, 228487.0], [25.6, 228487.0], [25.7, 228487.0], [25.8, 228487.0], [25.9, 228490.0], [26.0, 228490.0], [26.1, 228490.0], [26.2, 228490.0], [26.3, 228490.0], [26.4, 228490.0], [26.5, 228490.0], [26.6, 228490.0], [26.7, 228552.0], [26.8, 228552.0], [26.9, 228552.0], [27.0, 228552.0], [27.1, 228552.0], [27.2, 228552.0], [27.3, 228552.0], [27.4, 228552.0], [27.5, 228555.0], [27.6, 228555.0], [27.7, 228555.0], [27.8, 228555.0], [27.9, 228555.0], [28.0, 228555.0], [28.1, 228555.0], [28.2, 228555.0], [28.3, 228555.0], [28.4, 228602.0], [28.5, 228602.0], [28.6, 228602.0], [28.7, 228602.0], [28.8, 228602.0], [28.9, 228602.0], [29.0, 228602.0], [29.1, 228602.0], [29.2, 228651.0], [29.3, 228651.0], [29.4, 228651.0], [29.5, 228651.0], [29.6, 228651.0], [29.7, 228651.0], [29.8, 228651.0], [29.9, 228651.0], [30.0, 228663.0], [30.1, 228663.0], [30.2, 228663.0], [30.3, 228663.0], [30.4, 228663.0], [30.5, 228663.0], [30.6, 228663.0], [30.7, 228663.0], [30.8, 228663.0], [30.9, 228811.0], [31.0, 228811.0], [31.1, 228811.0], [31.2, 228811.0], [31.3, 228811.0], [31.4, 228811.0], [31.5, 228811.0], [31.6, 228811.0], [31.7, 229061.0], [31.8, 229061.0], [31.9, 229061.0], [32.0, 229061.0], [32.1, 229061.0], [32.2, 229061.0], [32.3, 229061.0], [32.4, 229061.0], [32.5, 229225.0], [32.6, 229225.0], [32.7, 229225.0], [32.8, 229225.0], [32.9, 229225.0], [33.0, 229225.0], [33.1, 229225.0], [33.2, 229225.0], [33.3, 229225.0], [33.4, 229431.0], [33.5, 229431.0], [33.6, 229431.0], [33.7, 229431.0], [33.8, 229431.0], [33.9, 229431.0], [34.0, 229431.0], [34.1, 229431.0], [34.2, 229583.0], [34.3, 229583.0], [34.4, 229583.0], [34.5, 229583.0], [34.6, 229583.0], [34.7, 229583.0], [34.8, 229583.0], [34.9, 229583.0], [35.0, 229637.0], [35.1, 229637.0], [35.2, 229637.0], [35.3, 229637.0], [35.4, 229637.0], [35.5, 229637.0], [35.6, 229637.0], [35.7, 229637.0], [35.8, 229637.0], [35.9, 229662.0], [36.0, 229662.0], [36.1, 229662.0], [36.2, 229662.0], [36.3, 229662.0], [36.4, 229662.0], [36.5, 229662.0], [36.6, 229662.0], [36.7, 229719.0], [36.8, 229719.0], [36.9, 229719.0], [37.0, 229719.0], [37.1, 229719.0], [37.2, 229719.0], [37.3, 229719.0], [37.4, 229719.0], [37.5, 230037.0], [37.6, 230037.0], [37.7, 230037.0], [37.8, 230037.0], [37.9, 230037.0], [38.0, 230037.0], [38.1, 230037.0], [38.2, 230037.0], [38.3, 230037.0], [38.4, 230132.0], [38.5, 230132.0], [38.6, 230132.0], [38.7, 230132.0], [38.8, 230132.0], [38.9, 230132.0], [39.0, 230132.0], [39.1, 230132.0], [39.2, 230685.0], [39.3, 230685.0], [39.4, 230685.0], [39.5, 230685.0], [39.6, 230685.0], [39.7, 230685.0], [39.8, 230685.0], [39.9, 230685.0], [40.0, 230685.0], [40.1, 230811.0], [40.2, 230811.0], [40.3, 230811.0], [40.4, 230811.0], [40.5, 230811.0], [40.6, 230811.0], [40.7, 230811.0], [40.8, 230811.0], [40.9, 230851.0], [41.0, 230851.0], [41.1, 230851.0], [41.2, 230851.0], [41.3, 230851.0], [41.4, 230851.0], [41.5, 230851.0], [41.6, 230851.0], [41.7, 230865.0], [41.8, 230865.0], [41.9, 230865.0], [42.0, 230865.0], [42.1, 230865.0], [42.2, 230865.0], [42.3, 230865.0], [42.4, 230865.0], [42.5, 230865.0], [42.6, 230894.0], [42.7, 230894.0], [42.8, 230894.0], [42.9, 230894.0], [43.0, 230894.0], [43.1, 230894.0], [43.2, 230894.0], [43.3, 230894.0], [43.4, 230900.0], [43.5, 230900.0], [43.6, 230900.0], [43.7, 230900.0], [43.8, 230900.0], [43.9, 230900.0], [44.0, 230900.0], [44.1, 230900.0], [44.2, 230941.0], [44.3, 230941.0], [44.4, 230941.0], [44.5, 230941.0], [44.6, 230941.0], [44.7, 230941.0], [44.8, 230941.0], [44.9, 230941.0], [45.0, 230941.0], [45.1, 230951.0], [45.2, 230951.0], [45.3, 230951.0], [45.4, 230951.0], [45.5, 230951.0], [45.6, 230951.0], [45.7, 230951.0], [45.8, 230951.0], [45.9, 230993.0], [46.0, 230993.0], [46.1, 230993.0], [46.2, 230993.0], [46.3, 230993.0], [46.4, 230993.0], [46.5, 230993.0], [46.6, 230993.0], [46.7, 231034.0], [46.8, 231034.0], [46.9, 231034.0], [47.0, 231034.0], [47.1, 231034.0], [47.2, 231034.0], [47.3, 231034.0], [47.4, 231034.0], [47.5, 231034.0], [47.6, 231166.0], [47.7, 231166.0], [47.8, 231166.0], [47.9, 231166.0], [48.0, 231166.0], [48.1, 231166.0], [48.2, 231166.0], [48.3, 231166.0], [48.4, 231392.0], [48.5, 231392.0], [48.6, 231392.0], [48.7, 231392.0], [48.8, 231392.0], [48.9, 231392.0], [49.0, 231392.0], [49.1, 231392.0], [49.2, 231609.0], [49.3, 231609.0], [49.4, 231609.0], [49.5, 231609.0], [49.6, 231609.0], [49.7, 231609.0], [49.8, 231609.0], [49.9, 231609.0], [50.0, 231609.0], [50.1, 231699.0], [50.2, 231699.0], [50.3, 231699.0], [50.4, 231699.0], [50.5, 231699.0], [50.6, 231699.0], [50.7, 231699.0], [50.8, 231699.0], [50.9, 231863.0], [51.0, 231863.0], [51.1, 231863.0], [51.2, 231863.0], [51.3, 231863.0], [51.4, 231863.0], [51.5, 231863.0], [51.6, 231863.0], [51.7, 231902.0], [51.8, 231902.0], [51.9, 231902.0], [52.0, 231902.0], [52.1, 231902.0], [52.2, 231902.0], [52.3, 231902.0], [52.4, 231902.0], [52.5, 231902.0], [52.6, 232091.0], [52.7, 232091.0], [52.8, 232091.0], [52.9, 232091.0], [53.0, 232091.0], [53.1, 232091.0], [53.2, 232091.0], [53.3, 232091.0], [53.4, 232147.0], [53.5, 232147.0], [53.6, 232147.0], [53.7, 232147.0], [53.8, 232147.0], [53.9, 232147.0], [54.0, 232147.0], [54.1, 232147.0], [54.2, 232314.0], [54.3, 232314.0], [54.4, 232314.0], [54.5, 232314.0], [54.6, 232314.0], [54.7, 232314.0], [54.8, 232314.0], [54.9, 232314.0], [55.0, 232314.0], [55.1, 232338.0], [55.2, 232338.0], [55.3, 232338.0], [55.4, 232338.0], [55.5, 232338.0], [55.6, 232338.0], [55.7, 232338.0], [55.8, 232338.0], [55.9, 232396.0], [56.0, 232396.0], [56.1, 232396.0], [56.2, 232396.0], [56.3, 232396.0], [56.4, 232396.0], [56.5, 232396.0], [56.6, 232396.0], [56.7, 232474.0], [56.8, 232474.0], [56.9, 232474.0], [57.0, 232474.0], [57.1, 232474.0], [57.2, 232474.0], [57.3, 232474.0], [57.4, 232474.0], [57.5, 232474.0], [57.6, 232752.0], [57.7, 232752.0], [57.8, 232752.0], [57.9, 232752.0], [58.0, 232752.0], [58.1, 232752.0], [58.2, 232752.0], [58.3, 232752.0], [58.4, 232804.0], [58.5, 232804.0], [58.6, 232804.0], [58.7, 232804.0], [58.8, 232804.0], [58.9, 232804.0], [59.0, 232804.0], [59.1, 232804.0], [59.2, 232988.0], [59.3, 232988.0], [59.4, 232988.0], [59.5, 232988.0], [59.6, 232988.0], [59.7, 232988.0], [59.8, 232988.0], [59.9, 232988.0], [60.0, 232988.0], [60.1, 233050.0], [60.2, 233050.0], [60.3, 233050.0], [60.4, 233050.0], [60.5, 233050.0], [60.6, 233050.0], [60.7, 233050.0], [60.8, 233050.0], [60.9, 233069.0], [61.0, 233069.0], [61.1, 233069.0], [61.2, 233069.0], [61.3, 233069.0], [61.4, 233069.0], [61.5, 233069.0], [61.6, 233069.0], [61.7, 233273.0], [61.8, 233273.0], [61.9, 233273.0], [62.0, 233273.0], [62.1, 233273.0], [62.2, 233273.0], [62.3, 233273.0], [62.4, 233273.0], [62.5, 233273.0], [62.6, 233376.0], [62.7, 233376.0], [62.8, 233376.0], [62.9, 233376.0], [63.0, 233376.0], [63.1, 233376.0], [63.2, 233376.0], [63.3, 233376.0], [63.4, 233417.0], [63.5, 233417.0], [63.6, 233417.0], [63.7, 233417.0], [63.8, 233417.0], [63.9, 233417.0], [64.0, 233417.0], [64.1, 233417.0], [64.2, 233638.0], [64.3, 233638.0], [64.4, 233638.0], [64.5, 233638.0], [64.6, 233638.0], [64.7, 233638.0], [64.8, 233638.0], [64.9, 233638.0], [65.0, 233638.0], [65.1, 234091.0], [65.2, 234091.0], [65.3, 234091.0], [65.4, 234091.0], [65.5, 234091.0], [65.6, 234091.0], [65.7, 234091.0], [65.8, 234091.0], [65.9, 234131.0], [66.0, 234131.0], [66.1, 234131.0], [66.2, 234131.0], [66.3, 234131.0], [66.4, 234131.0], [66.5, 234131.0], [66.6, 234131.0], [66.7, 234214.0], [66.8, 234214.0], [66.9, 234214.0], [67.0, 234214.0], [67.1, 234214.0], [67.2, 234214.0], [67.3, 234214.0], [67.4, 234214.0], [67.5, 234214.0], [67.6, 234241.0], [67.7, 234241.0], [67.8, 234241.0], [67.9, 234241.0], [68.0, 234241.0], [68.1, 234241.0], [68.2, 234241.0], [68.3, 234241.0], [68.4, 234282.0], [68.5, 234282.0], [68.6, 234282.0], [68.7, 234282.0], [68.8, 234282.0], [68.9, 234282.0], [69.0, 234282.0], [69.1, 234282.0], [69.2, 234354.0], [69.3, 234354.0], [69.4, 234354.0], [69.5, 234354.0], [69.6, 234354.0], [69.7, 234354.0], [69.8, 234354.0], [69.9, 234354.0], [70.0, 234354.0], [70.1, 234358.0], [70.2, 234358.0], [70.3, 234358.0], [70.4, 234358.0], [70.5, 234358.0], [70.6, 234358.0], [70.7, 234358.0], [70.8, 234358.0], [70.9, 234712.0], [71.0, 234712.0], [71.1, 234712.0], [71.2, 234712.0], [71.3, 234712.0], [71.4, 234712.0], [71.5, 234712.0], [71.6, 234712.0], [71.7, 234714.0], [71.8, 234714.0], [71.9, 234714.0], [72.0, 234714.0], [72.1, 234714.0], [72.2, 234714.0], [72.3, 234714.0], [72.4, 234714.0], [72.5, 234714.0], [72.6, 234900.0], [72.7, 234900.0], [72.8, 234900.0], [72.9, 234900.0], [73.0, 234900.0], [73.1, 234900.0], [73.2, 234900.0], [73.3, 234900.0], [73.4, 234938.0], [73.5, 234938.0], [73.6, 234938.0], [73.7, 234938.0], [73.8, 234938.0], [73.9, 234938.0], [74.0, 234938.0], [74.1, 234938.0], [74.2, 235102.0], [74.3, 235102.0], [74.4, 235102.0], [74.5, 235102.0], [74.6, 235102.0], [74.7, 235102.0], [74.8, 235102.0], [74.9, 235102.0], [75.0, 235102.0], [75.1, 235233.0], [75.2, 235233.0], [75.3, 235233.0], [75.4, 235233.0], [75.5, 235233.0], [75.6, 235233.0], [75.7, 235233.0], [75.8, 235233.0], [75.9, 235308.0], [76.0, 235308.0], [76.1, 235308.0], [76.2, 235308.0], [76.3, 235308.0], [76.4, 235308.0], [76.5, 235308.0], [76.6, 235308.0], [76.7, 235316.0], [76.8, 235316.0], [76.9, 235316.0], [77.0, 235316.0], [77.1, 235316.0], [77.2, 235316.0], [77.3, 235316.0], [77.4, 235316.0], [77.5, 235354.0], [77.6, 235354.0], [77.7, 235354.0], [77.8, 235354.0], [77.9, 235354.0], [78.0, 235354.0], [78.1, 235354.0], [78.2, 235354.0], [78.3, 235354.0], [78.4, 235500.0], [78.5, 235500.0], [78.6, 235500.0], [78.7, 235500.0], [78.8, 235500.0], [78.9, 235500.0], [79.0, 235500.0], [79.1, 235500.0], [79.2, 235691.0], [79.3, 235691.0], [79.4, 235691.0], [79.5, 235691.0], [79.6, 235691.0], [79.7, 235691.0], [79.8, 235691.0], [79.9, 235691.0], [80.0, 235747.0], [80.1, 235747.0], [80.2, 235747.0], [80.3, 235747.0], [80.4, 235747.0], [80.5, 235747.0], [80.6, 235747.0], [80.7, 235747.0], [80.8, 235747.0], [80.9, 235924.0], [81.0, 235924.0], [81.1, 235924.0], [81.2, 235924.0], [81.3, 235924.0], [81.4, 235924.0], [81.5, 235924.0], [81.6, 235924.0], [81.7, 235983.0], [81.8, 235983.0], [81.9, 235983.0], [82.0, 235983.0], [82.1, 235983.0], [82.2, 235983.0], [82.3, 235983.0], [82.4, 235983.0], [82.5, 236249.0], [82.6, 236249.0], [82.7, 236249.0], [82.8, 236249.0], [82.9, 236249.0], [83.0, 236249.0], [83.1, 236249.0], [83.2, 236249.0], [83.3, 236249.0], [83.4, 236333.0], [83.5, 236333.0], [83.6, 236333.0], [83.7, 236333.0], [83.8, 236333.0], [83.9, 236333.0], [84.0, 236333.0], [84.1, 236333.0], [84.2, 236529.0], [84.3, 236529.0], [84.4, 236529.0], [84.5, 236529.0], [84.6, 236529.0], [84.7, 236529.0], [84.8, 236529.0], [84.9, 236529.0], [85.0, 236541.0], [85.1, 236541.0], [85.2, 236541.0], [85.3, 236541.0], [85.4, 236541.0], [85.5, 236541.0], [85.6, 236541.0], [85.7, 236541.0], [85.8, 236541.0], [85.9, 236576.0], [86.0, 236576.0], [86.1, 236576.0], [86.2, 236576.0], [86.3, 236576.0], [86.4, 236576.0], [86.5, 236576.0], [86.6, 236576.0], [86.7, 236621.0], [86.8, 236621.0], [86.9, 236621.0], [87.0, 236621.0], [87.1, 236621.0], [87.2, 236621.0], [87.3, 236621.0], [87.4, 236621.0], [87.5, 236846.0], [87.6, 236846.0], [87.7, 236846.0], [87.8, 236846.0], [87.9, 236846.0], [88.0, 236846.0], [88.1, 236846.0], [88.2, 236846.0], [88.3, 236846.0], [88.4, 237071.0], [88.5, 237071.0], [88.6, 237071.0], [88.7, 237071.0], [88.8, 237071.0], [88.9, 237071.0], [89.0, 237071.0], [89.1, 237071.0], [89.2, 237241.0], [89.3, 237241.0], [89.4, 237241.0], [89.5, 237241.0], [89.6, 237241.0], [89.7, 237241.0], [89.8, 237241.0], [89.9, 237241.0], [90.0, 237515.0], [90.1, 237515.0], [90.2, 237515.0], [90.3, 237515.0], [90.4, 237515.0], [90.5, 237515.0], [90.6, 237515.0], [90.7, 237515.0], [90.8, 237515.0], [90.9, 238009.0], [91.0, 238009.0], [91.1, 238009.0], [91.2, 238009.0], [91.3, 238009.0], [91.4, 238009.0], [91.5, 238009.0], [91.6, 238009.0], [91.7, 238109.0], [91.8, 238109.0], [91.9, 238109.0], [92.0, 238109.0], [92.1, 238109.0], [92.2, 238109.0], [92.3, 238109.0], [92.4, 238109.0], [92.5, 238202.0], [92.6, 238202.0], [92.7, 238202.0], [92.8, 238202.0], [92.9, 238202.0], [93.0, 238202.0], [93.1, 238202.0], [93.2, 238202.0], [93.3, 238202.0], [93.4, 238353.0], [93.5, 238353.0], [93.6, 238353.0], [93.7, 238353.0], [93.8, 238353.0], [93.9, 238353.0], [94.0, 238353.0], [94.1, 238353.0], [94.2, 238741.0], [94.3, 238741.0], [94.4, 238741.0], [94.5, 238741.0], [94.6, 238741.0], [94.7, 238741.0], [94.8, 238741.0], [94.9, 238741.0], [95.0, 238936.0], [95.1, 238936.0], [95.2, 238936.0], [95.3, 238936.0], [95.4, 238936.0], [95.5, 238936.0], [95.6, 238936.0], [95.7, 238936.0], [95.8, 238936.0], [95.9, 238944.0], [96.0, 238944.0], [96.1, 238944.0], [96.2, 238944.0], [96.3, 238944.0], [96.4, 238944.0], [96.5, 238944.0], [96.6, 238944.0], [96.7, 238944.0], [96.8, 238944.0], [96.9, 238944.0], [97.0, 238944.0], [97.1, 238944.0], [97.2, 238944.0], [97.3, 238944.0], [97.4, 238944.0], [97.5, 238985.0], [97.6, 238985.0], [97.7, 238985.0], [97.8, 238985.0], [97.9, 238985.0], [98.0, 238985.0], [98.1, 238985.0], [98.2, 238985.0], [98.3, 238985.0], [98.4, 240117.0], [98.5, 240117.0], [98.6, 240117.0], [98.7, 240117.0], [98.8, 240117.0], [98.9, 240117.0], [99.0, 240117.0], [99.1, 240117.0], [99.2, 241014.0], [99.3, 241014.0], [99.4, 241014.0], [99.5, 241014.0], [99.6, 241014.0], [99.7, 241014.0], [99.8, 241014.0], [99.9, 241014.0]], "isOverall": false, "label": "HTTP Request", "isController": false}], "supportsControllersDiscrimination": true, "maxX": 100.0, "title": "Response Time Percentiles"}},
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
        data: {"result": {"minY": 1.0, "minX": 208800.0, "maxY": 4.0, "series": [{"data": [[208800.0, 1.0], [227200.0, 2.0], [229200.0, 1.0], [228400.0, 4.0], [226800.0, 1.0], [225600.0, 1.0], [224400.0, 1.0], [228800.0, 1.0], [235600.0, 1.0], [233200.0, 1.0], [232800.0, 1.0], [230800.0, 4.0], [230000.0, 1.0], [229600.0, 2.0], [236800.0, 1.0], [233600.0, 1.0], [237200.0, 1.0], [232400.0, 1.0], [232000.0, 1.0], [234000.0, 1.0], [231600.0, 2.0], [235200.0, 1.0], [238000.0, 1.0], [212100.0, 1.0], [226100.0, 1.0], [225700.0, 1.0], [228500.0, 2.0], [227300.0, 1.0], [224100.0, 1.0], [225300.0, 1.0], [226500.0, 1.0], [223300.0, 1.0], [230900.0, 4.0], [229700.0, 1.0], [230100.0, 1.0], [231300.0, 1.0], [232100.0, 1.0], [232900.0, 1.0], [233300.0, 1.0], [235300.0, 3.0], [234900.0, 2.0], [234100.0, 1.0], [235700.0, 1.0], [236500.0, 3.0], [238900.0, 4.0], [238100.0, 1.0], [240100.0, 1.0], [211800.0, 1.0], [213800.0, 1.0], [220200.0, 1.0], [229000.0, 1.0], [227800.0, 2.0], [228600.0, 3.0], [227400.0, 2.0], [227000.0, 1.0], [231000.0, 1.0], [233000.0, 2.0], [236200.0, 1.0], [231800.0, 1.0], [234200.0, 3.0], [236600.0, 1.0], [237000.0, 1.0], [233400.0, 1.0], [230600.0, 1.0], [229400.0, 1.0], [238200.0, 1.0], [241000.0, 1.0], [210300.0, 1.0], [224300.0, 1.0], [223900.0, 1.0], [226700.0, 1.0], [226300.0, 1.0], [228300.0, 1.0], [231100.0, 1.0], [232300.0, 3.0], [231900.0, 1.0], [232700.0, 1.0], [229500.0, 1.0], [234300.0, 2.0], [237500.0, 1.0], [235100.0, 1.0], [235500.0, 1.0], [234700.0, 2.0], [235900.0, 2.0], [236300.0, 1.0], [238700.0, 1.0], [238300.0, 1.0]], "isOverall": false, "label": "HTTP Request", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 100, "maxX": 241000.0, "title": "Response Time Distribution"}},
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
        data: {"result": {"minY": 30.5, "minX": 1.5208224E12, "maxY": 60.0, "series": [{"data": [[1.52082246E12, 60.0], [1.5208224E12, 60.0], [1.52082264E12, 30.5]], "isOverall": false, "label": "Thread Group", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.52082264E12, "title": "Active Threads Over Time"}},
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
        data: {"result": {"minY": 223315.0, "minX": 1.0, "maxY": 241014.0, "series": [{"data": [[2.0, 234214.0], [3.0, 230037.0], [4.0, 228364.0], [5.0, 228811.0], [6.0, 227815.0], [7.0, 227495.0], [8.0, 224468.0], [9.0, 238944.0], [10.0, 229583.0], [11.0, 228464.0], [12.0, 226530.0], [13.0, 227039.0], [14.0, 225629.0], [15.0, 226390.0], [16.0, 228487.0], [17.0, 225388.0], [18.0, 228555.0], [19.0, 238353.0], [20.0, 228424.0], [21.0, 226846.0], [22.0, 228651.0], [23.0, 224118.0], [24.0, 226725.0], [25.0, 227262.0], [26.0, 227496.0], [27.0, 231699.0], [28.0, 227322.0], [29.0, 229431.0], [30.0, 228602.0], [31.0, 228663.0], [33.0, 232338.0], [32.0, 234282.0], [35.0, 230894.0], [34.0, 230685.0], [37.0, 228552.0], [36.0, 233417.0], [39.0, 230941.0], [38.0, 229662.0], [41.0, 228490.0], [40.0, 230865.0], [43.0, 235316.0], [42.0, 229225.0], [45.0, 227238.0], [44.0, 230811.0], [47.0, 229637.0], [46.0, 232804.0], [49.0, 237515.0], [48.0, 230851.0], [51.0, 227833.0], [50.0, 230993.0], [53.0, 237071.0], [52.0, 235500.0], [55.0, 234712.0], [54.0, 241014.0], [57.0, 236333.0], [56.0, 240117.0], [59.0, 234938.0], [58.0, 233069.0], [60.0, 231628.81967213118], [1.0, 223315.0]], "isOverall": false, "label": "HTTP Request", "isController": false}, {"data": [[45.25, 231063.17500000013]], "isOverall": false, "label": "HTTP Request-Aggregated", "isController": false}], "supportsControllersDiscrimination": true, "maxX": 60.0, "title": "Time VS Threads"}},
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
        data : {"result": {"minY": 48.3, "minX": 1.5208224E12, "maxY": 43293.0, "series": [{"data": [[1.52082246E12, 30305.1], [1.5208224E12, 12987.9], [1.52082264E12, 43293.0]], "isOverall": false, "label": "Bytes received per second", "isController": false}, {"data": [[1.52082246E12, 112.7], [1.5208224E12, 48.3], [1.52082264E12, 161.0]], "isOverall": false, "label": "Bytes sent per second", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.52082264E12, "title": "Bytes Throughput Over Time"}},
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
        data: {"result": {"minY": 223713.7777777778, "minX": 1.5208224E12, "maxY": 235056.61904761905, "series": [{"data": [[1.52082246E12, 235056.61904761905], [1.5208224E12, 223713.7777777778], [1.52082264E12, 230472.5833333333]], "isOverall": false, "label": "HTTP Request", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.52082264E12, "title": "Response Time Over Time"}},
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
        data: {"result": {"minY": 33380.444444444445, "minX": 1.5208224E12, "maxY": 45615.20000000001, "series": [{"data": [[1.52082246E12, 45114.2619047619], [1.5208224E12, 33380.444444444445], [1.52082264E12, 45615.20000000001]], "isOverall": false, "label": "HTTP Request", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.52082264E12, "title": "Latencies Over Time"}},
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
        data: {"result": {"minY": 7.4, "minX": 1.5208224E12, "maxY": 13.166666666666666, "series": [{"data": [[1.52082246E12, 9.119047619047617], [1.5208224E12, 13.166666666666666], [1.52082264E12, 7.4]], "isOverall": false, "label": "HTTP Request", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.52082264E12, "title": "Connect Time Over Time"}},
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
        data: {"result": {"minY": 208832.0, "minX": 1.5208224E12, "maxY": 241014.0, "series": [{"data": [[1.52082246E12, 238985.0], [1.5208224E12, 232314.0], [1.52082264E12, 241014.0]], "isOverall": false, "label": "Max", "isController": false}, {"data": [[1.52082246E12, 229061.0], [1.5208224E12, 208832.0], [1.52082264E12, 223315.0]], "isOverall": false, "label": "Min", "isController": false}, {"data": [[1.52082246E12, 238099.0], [1.5208224E12, 231943.2], [1.52082264E12, 237487.6]], "isOverall": false, "label": "90th percentile", "isController": false}, {"data": [[1.52082246E12, 238985.0], [1.5208224E12, 232314.0], [1.52082264E12, 240825.63]], "isOverall": false, "label": "99th percentile", "isController": false}, {"data": [[1.52082246E12, 238926.25], [1.5208224E12, 232314.0], [1.52082264E12, 238926.25]], "isOverall": false, "label": "95th percentile", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.52082264E12, "title": "Response Time Percentiles Over Time (successful requests only)"}},
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
    data: {"result": {"minY": 229507.0, "minX": 0.0, "maxY": 233507.0, "series": [{"data": [[0.0, 233507.0], [1.0, 229507.0]], "isOverall": false, "label": "Successes", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.0, "title": "Response Time Vs Request"}},
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
    data: {"result": {"minY": 44687.0, "minX": 0.0, "maxY": 45605.5, "series": [{"data": [[0.0, 44687.0], [1.0, 45605.5]], "isOverall": false, "label": "Successes", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.0, "title": "Latencies Vs Request"}},
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
        data: {"result": {"minY": 0.3, "minX": 1.52082222E12, "maxY": 1.0, "series": [{"data": [[1.52082246E12, 0.7], [1.5208224E12, 0.3], [1.52082222E12, 1.0]], "isOverall": false, "label": "hitsPerSecond", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.52082246E12, "title": "Hits Per Second"}},
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
        data: {"result": {"minY": 0.3, "minX": 1.5208224E12, "maxY": 1.0, "series": [{"data": [[1.52082246E12, 0.7], [1.5208224E12, 0.3], [1.52082264E12, 1.0]], "isOverall": false, "label": "200", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.52082264E12, "title": "Codes Per Second"}},
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
        data: {"result": {"minY": 0.3, "minX": 1.5208224E12, "maxY": 1.0, "series": [{"data": [[1.52082246E12, 0.7], [1.5208224E12, 0.3], [1.52082264E12, 1.0]], "isOverall": false, "label": "HTTP Request-success", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.52082264E12, "title": "Transactions Per Second"}},
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
