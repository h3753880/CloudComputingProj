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
        data: {"result": {"minY": 209901.0, "minX": 0.0, "maxY": 247595.0, "series": [{"data": [[0.0, 209901.0], [0.1, 209901.0], [0.2, 209901.0], [0.3, 209901.0], [0.4, 209901.0], [0.5, 209901.0], [0.6, 209901.0], [0.7, 209901.0], [0.8, 209901.0], [0.9, 212905.0], [1.0, 212905.0], [1.1, 212905.0], [1.2, 212905.0], [1.3, 212905.0], [1.4, 212905.0], [1.5, 212905.0], [1.6, 212905.0], [1.7, 216339.0], [1.8, 216339.0], [1.9, 216339.0], [2.0, 216339.0], [2.1, 216339.0], [2.2, 216339.0], [2.3, 216339.0], [2.4, 216339.0], [2.5, 216644.0], [2.6, 216644.0], [2.7, 216644.0], [2.8, 216644.0], [2.9, 216644.0], [3.0, 216644.0], [3.1, 216644.0], [3.2, 216644.0], [3.3, 216644.0], [3.4, 217281.0], [3.5, 217281.0], [3.6, 217281.0], [3.7, 217281.0], [3.8, 217281.0], [3.9, 217281.0], [4.0, 217281.0], [4.1, 217281.0], [4.2, 218751.0], [4.3, 218751.0], [4.4, 218751.0], [4.5, 218751.0], [4.6, 218751.0], [4.7, 218751.0], [4.8, 218751.0], [4.9, 218751.0], [5.0, 219749.0], [5.1, 219749.0], [5.2, 219749.0], [5.3, 219749.0], [5.4, 219749.0], [5.5, 219749.0], [5.6, 219749.0], [5.7, 219749.0], [5.8, 219749.0], [5.9, 223843.0], [6.0, 223843.0], [6.1, 223843.0], [6.2, 223843.0], [6.3, 223843.0], [6.4, 223843.0], [6.5, 223843.0], [6.6, 223843.0], [6.7, 224459.0], [6.8, 224459.0], [6.9, 224459.0], [7.0, 224459.0], [7.1, 224459.0], [7.2, 224459.0], [7.3, 224459.0], [7.4, 224459.0], [7.5, 225288.0], [7.6, 225288.0], [7.7, 225288.0], [7.8, 225288.0], [7.9, 225288.0], [8.0, 225288.0], [8.1, 225288.0], [8.2, 225288.0], [8.3, 225288.0], [8.4, 226479.0], [8.5, 226479.0], [8.6, 226479.0], [8.7, 226479.0], [8.8, 226479.0], [8.9, 226479.0], [9.0, 226479.0], [9.1, 226479.0], [9.2, 226980.0], [9.3, 226980.0], [9.4, 226980.0], [9.5, 226980.0], [9.6, 226980.0], [9.7, 226980.0], [9.8, 226980.0], [9.9, 226980.0], [10.0, 227592.0], [10.1, 227592.0], [10.2, 227592.0], [10.3, 227592.0], [10.4, 227592.0], [10.5, 227592.0], [10.6, 227592.0], [10.7, 227592.0], [10.8, 227592.0], [10.9, 227812.0], [11.0, 227812.0], [11.1, 227812.0], [11.2, 227812.0], [11.3, 227812.0], [11.4, 227812.0], [11.5, 227812.0], [11.6, 227812.0], [11.7, 228180.0], [11.8, 228180.0], [11.9, 228180.0], [12.0, 228180.0], [12.1, 228180.0], [12.2, 228180.0], [12.3, 228180.0], [12.4, 228180.0], [12.5, 228180.0], [12.6, 228189.0], [12.7, 228189.0], [12.8, 228189.0], [12.9, 228189.0], [13.0, 228189.0], [13.1, 228189.0], [13.2, 228189.0], [13.3, 228189.0], [13.4, 228679.0], [13.5, 228679.0], [13.6, 228679.0], [13.7, 228679.0], [13.8, 228679.0], [13.9, 228679.0], [14.0, 228679.0], [14.1, 228679.0], [14.2, 228832.0], [14.3, 228832.0], [14.4, 228832.0], [14.5, 228832.0], [14.6, 228832.0], [14.7, 228832.0], [14.8, 228832.0], [14.9, 228832.0], [15.0, 228832.0], [15.1, 229234.0], [15.2, 229234.0], [15.3, 229234.0], [15.4, 229234.0], [15.5, 229234.0], [15.6, 229234.0], [15.7, 229234.0], [15.8, 229234.0], [15.9, 229295.0], [16.0, 229295.0], [16.1, 229295.0], [16.2, 229295.0], [16.3, 229295.0], [16.4, 229295.0], [16.5, 229295.0], [16.6, 229295.0], [16.7, 229306.0], [16.8, 229306.0], [16.9, 229306.0], [17.0, 229306.0], [17.1, 229306.0], [17.2, 229306.0], [17.3, 229306.0], [17.4, 229306.0], [17.5, 229306.0], [17.6, 229882.0], [17.7, 229882.0], [17.8, 229882.0], [17.9, 229882.0], [18.0, 229882.0], [18.1, 229882.0], [18.2, 229882.0], [18.3, 229882.0], [18.4, 230213.0], [18.5, 230213.0], [18.6, 230213.0], [18.7, 230213.0], [18.8, 230213.0], [18.9, 230213.0], [19.0, 230213.0], [19.1, 230213.0], [19.2, 230358.0], [19.3, 230358.0], [19.4, 230358.0], [19.5, 230358.0], [19.6, 230358.0], [19.7, 230358.0], [19.8, 230358.0], [19.9, 230358.0], [20.0, 230413.0], [20.1, 230413.0], [20.2, 230413.0], [20.3, 230413.0], [20.4, 230413.0], [20.5, 230413.0], [20.6, 230413.0], [20.7, 230413.0], [20.8, 230413.0], [20.9, 230525.0], [21.0, 230525.0], [21.1, 230525.0], [21.2, 230525.0], [21.3, 230525.0], [21.4, 230525.0], [21.5, 230525.0], [21.6, 230525.0], [21.7, 230652.0], [21.8, 230652.0], [21.9, 230652.0], [22.0, 230652.0], [22.1, 230652.0], [22.2, 230652.0], [22.3, 230652.0], [22.4, 230652.0], [22.5, 230794.0], [22.6, 230794.0], [22.7, 230794.0], [22.8, 230794.0], [22.9, 230794.0], [23.0, 230794.0], [23.1, 230794.0], [23.2, 230794.0], [23.3, 230794.0], [23.4, 231189.0], [23.5, 231189.0], [23.6, 231189.0], [23.7, 231189.0], [23.8, 231189.0], [23.9, 231189.0], [24.0, 231189.0], [24.1, 231189.0], [24.2, 231254.0], [24.3, 231254.0], [24.4, 231254.0], [24.5, 231254.0], [24.6, 231254.0], [24.7, 231254.0], [24.8, 231254.0], [24.9, 231254.0], [25.0, 231331.0], [25.1, 231331.0], [25.2, 231331.0], [25.3, 231331.0], [25.4, 231331.0], [25.5, 231331.0], [25.6, 231331.0], [25.7, 231331.0], [25.8, 231331.0], [25.9, 231777.0], [26.0, 231777.0], [26.1, 231777.0], [26.2, 231777.0], [26.3, 231777.0], [26.4, 231777.0], [26.5, 231777.0], [26.6, 231777.0], [26.7, 231943.0], [26.8, 231943.0], [26.9, 231943.0], [27.0, 231943.0], [27.1, 231943.0], [27.2, 231943.0], [27.3, 231943.0], [27.4, 231943.0], [27.5, 232032.0], [27.6, 232032.0], [27.7, 232032.0], [27.8, 232032.0], [27.9, 232032.0], [28.0, 232032.0], [28.1, 232032.0], [28.2, 232032.0], [28.3, 232032.0], [28.4, 232059.0], [28.5, 232059.0], [28.6, 232059.0], [28.7, 232059.0], [28.8, 232059.0], [28.9, 232059.0], [29.0, 232059.0], [29.1, 232059.0], [29.2, 232149.0], [29.3, 232149.0], [29.4, 232149.0], [29.5, 232149.0], [29.6, 232149.0], [29.7, 232149.0], [29.8, 232149.0], [29.9, 232149.0], [30.0, 232317.0], [30.1, 232317.0], [30.2, 232317.0], [30.3, 232317.0], [30.4, 232317.0], [30.5, 232317.0], [30.6, 232317.0], [30.7, 232317.0], [30.8, 232317.0], [30.9, 232388.0], [31.0, 232388.0], [31.1, 232388.0], [31.2, 232388.0], [31.3, 232388.0], [31.4, 232388.0], [31.5, 232388.0], [31.6, 232388.0], [31.7, 232522.0], [31.8, 232522.0], [31.9, 232522.0], [32.0, 232522.0], [32.1, 232522.0], [32.2, 232522.0], [32.3, 232522.0], [32.4, 232522.0], [32.5, 232569.0], [32.6, 232569.0], [32.7, 232569.0], [32.8, 232569.0], [32.9, 232569.0], [33.0, 232569.0], [33.1, 232569.0], [33.2, 232569.0], [33.3, 232569.0], [33.4, 232791.0], [33.5, 232791.0], [33.6, 232791.0], [33.7, 232791.0], [33.8, 232791.0], [33.9, 232791.0], [34.0, 232791.0], [34.1, 232791.0], [34.2, 232850.0], [34.3, 232850.0], [34.4, 232850.0], [34.5, 232850.0], [34.6, 232850.0], [34.7, 232850.0], [34.8, 232850.0], [34.9, 232850.0], [35.0, 232978.0], [35.1, 232978.0], [35.2, 232978.0], [35.3, 232978.0], [35.4, 232978.0], [35.5, 232978.0], [35.6, 232978.0], [35.7, 232978.0], [35.8, 232978.0], [35.9, 233317.0], [36.0, 233317.0], [36.1, 233317.0], [36.2, 233317.0], [36.3, 233317.0], [36.4, 233317.0], [36.5, 233317.0], [36.6, 233317.0], [36.7, 233468.0], [36.8, 233468.0], [36.9, 233468.0], [37.0, 233468.0], [37.1, 233468.0], [37.2, 233468.0], [37.3, 233468.0], [37.4, 233468.0], [37.5, 233522.0], [37.6, 233522.0], [37.7, 233522.0], [37.8, 233522.0], [37.9, 233522.0], [38.0, 233522.0], [38.1, 233522.0], [38.2, 233522.0], [38.3, 233522.0], [38.4, 233548.0], [38.5, 233548.0], [38.6, 233548.0], [38.7, 233548.0], [38.8, 233548.0], [38.9, 233548.0], [39.0, 233548.0], [39.1, 233548.0], [39.2, 233606.0], [39.3, 233606.0], [39.4, 233606.0], [39.5, 233606.0], [39.6, 233606.0], [39.7, 233606.0], [39.8, 233606.0], [39.9, 233606.0], [40.0, 233606.0], [40.1, 233843.0], [40.2, 233843.0], [40.3, 233843.0], [40.4, 233843.0], [40.5, 233843.0], [40.6, 233843.0], [40.7, 233843.0], [40.8, 233843.0], [40.9, 233873.0], [41.0, 233873.0], [41.1, 233873.0], [41.2, 233873.0], [41.3, 233873.0], [41.4, 233873.0], [41.5, 233873.0], [41.6, 233873.0], [41.7, 233882.0], [41.8, 233882.0], [41.9, 233882.0], [42.0, 233882.0], [42.1, 233882.0], [42.2, 233882.0], [42.3, 233882.0], [42.4, 233882.0], [42.5, 233882.0], [42.6, 233974.0], [42.7, 233974.0], [42.8, 233974.0], [42.9, 233974.0], [43.0, 233974.0], [43.1, 233974.0], [43.2, 233974.0], [43.3, 233974.0], [43.4, 234047.0], [43.5, 234047.0], [43.6, 234047.0], [43.7, 234047.0], [43.8, 234047.0], [43.9, 234047.0], [44.0, 234047.0], [44.1, 234047.0], [44.2, 234047.0], [44.3, 234047.0], [44.4, 234047.0], [44.5, 234047.0], [44.6, 234047.0], [44.7, 234047.0], [44.8, 234047.0], [44.9, 234047.0], [45.0, 234047.0], [45.1, 234280.0], [45.2, 234280.0], [45.3, 234280.0], [45.4, 234280.0], [45.5, 234280.0], [45.6, 234280.0], [45.7, 234280.0], [45.8, 234280.0], [45.9, 234294.0], [46.0, 234294.0], [46.1, 234294.0], [46.2, 234294.0], [46.3, 234294.0], [46.4, 234294.0], [46.5, 234294.0], [46.6, 234294.0], [46.7, 234298.0], [46.8, 234298.0], [46.9, 234298.0], [47.0, 234298.0], [47.1, 234298.0], [47.2, 234298.0], [47.3, 234298.0], [47.4, 234298.0], [47.5, 234298.0], [47.6, 234332.0], [47.7, 234332.0], [47.8, 234332.0], [47.9, 234332.0], [48.0, 234332.0], [48.1, 234332.0], [48.2, 234332.0], [48.3, 234332.0], [48.4, 234452.0], [48.5, 234452.0], [48.6, 234452.0], [48.7, 234452.0], [48.8, 234452.0], [48.9, 234452.0], [49.0, 234452.0], [49.1, 234452.0], [49.2, 234559.0], [49.3, 234559.0], [49.4, 234559.0], [49.5, 234559.0], [49.6, 234559.0], [49.7, 234559.0], [49.8, 234559.0], [49.9, 234559.0], [50.0, 234559.0], [50.1, 234707.0], [50.2, 234707.0], [50.3, 234707.0], [50.4, 234707.0], [50.5, 234707.0], [50.6, 234707.0], [50.7, 234707.0], [50.8, 234707.0], [50.9, 234776.0], [51.0, 234776.0], [51.1, 234776.0], [51.2, 234776.0], [51.3, 234776.0], [51.4, 234776.0], [51.5, 234776.0], [51.6, 234776.0], [51.7, 234788.0], [51.8, 234788.0], [51.9, 234788.0], [52.0, 234788.0], [52.1, 234788.0], [52.2, 234788.0], [52.3, 234788.0], [52.4, 234788.0], [52.5, 234788.0], [52.6, 234830.0], [52.7, 234830.0], [52.8, 234830.0], [52.9, 234830.0], [53.0, 234830.0], [53.1, 234830.0], [53.2, 234830.0], [53.3, 234830.0], [53.4, 234833.0], [53.5, 234833.0], [53.6, 234833.0], [53.7, 234833.0], [53.8, 234833.0], [53.9, 234833.0], [54.0, 234833.0], [54.1, 234833.0], [54.2, 235092.0], [54.3, 235092.0], [54.4, 235092.0], [54.5, 235092.0], [54.6, 235092.0], [54.7, 235092.0], [54.8, 235092.0], [54.9, 235092.0], [55.0, 235092.0], [55.1, 235294.0], [55.2, 235294.0], [55.3, 235294.0], [55.4, 235294.0], [55.5, 235294.0], [55.6, 235294.0], [55.7, 235294.0], [55.8, 235294.0], [55.9, 235408.0], [56.0, 235408.0], [56.1, 235408.0], [56.2, 235408.0], [56.3, 235408.0], [56.4, 235408.0], [56.5, 235408.0], [56.6, 235408.0], [56.7, 235563.0], [56.8, 235563.0], [56.9, 235563.0], [57.0, 235563.0], [57.1, 235563.0], [57.2, 235563.0], [57.3, 235563.0], [57.4, 235563.0], [57.5, 235563.0], [57.6, 235578.0], [57.7, 235578.0], [57.8, 235578.0], [57.9, 235578.0], [58.0, 235578.0], [58.1, 235578.0], [58.2, 235578.0], [58.3, 235578.0], [58.4, 235617.0], [58.5, 235617.0], [58.6, 235617.0], [58.7, 235617.0], [58.8, 235617.0], [58.9, 235617.0], [59.0, 235617.0], [59.1, 235617.0], [59.2, 235660.0], [59.3, 235660.0], [59.4, 235660.0], [59.5, 235660.0], [59.6, 235660.0], [59.7, 235660.0], [59.8, 235660.0], [59.9, 235660.0], [60.0, 235660.0], [60.1, 235833.0], [60.2, 235833.0], [60.3, 235833.0], [60.4, 235833.0], [60.5, 235833.0], [60.6, 235833.0], [60.7, 235833.0], [60.8, 235833.0], [60.9, 235859.0], [61.0, 235859.0], [61.1, 235859.0], [61.2, 235859.0], [61.3, 235859.0], [61.4, 235859.0], [61.5, 235859.0], [61.6, 235859.0], [61.7, 235956.0], [61.8, 235956.0], [61.9, 235956.0], [62.0, 235956.0], [62.1, 235956.0], [62.2, 235956.0], [62.3, 235956.0], [62.4, 235956.0], [62.5, 235956.0], [62.6, 235966.0], [62.7, 235966.0], [62.8, 235966.0], [62.9, 235966.0], [63.0, 235966.0], [63.1, 235966.0], [63.2, 235966.0], [63.3, 235966.0], [63.4, 236246.0], [63.5, 236246.0], [63.6, 236246.0], [63.7, 236246.0], [63.8, 236246.0], [63.9, 236246.0], [64.0, 236246.0], [64.1, 236246.0], [64.2, 236313.0], [64.3, 236313.0], [64.4, 236313.0], [64.5, 236313.0], [64.6, 236313.0], [64.7, 236313.0], [64.8, 236313.0], [64.9, 236313.0], [65.0, 236313.0], [65.1, 236421.0], [65.2, 236421.0], [65.3, 236421.0], [65.4, 236421.0], [65.5, 236421.0], [65.6, 236421.0], [65.7, 236421.0], [65.8, 236421.0], [65.9, 236438.0], [66.0, 236438.0], [66.1, 236438.0], [66.2, 236438.0], [66.3, 236438.0], [66.4, 236438.0], [66.5, 236438.0], [66.6, 236438.0], [66.7, 236474.0], [66.8, 236474.0], [66.9, 236474.0], [67.0, 236474.0], [67.1, 236474.0], [67.2, 236474.0], [67.3, 236474.0], [67.4, 236474.0], [67.5, 236474.0], [67.6, 236555.0], [67.7, 236555.0], [67.8, 236555.0], [67.9, 236555.0], [68.0, 236555.0], [68.1, 236555.0], [68.2, 236555.0], [68.3, 236555.0], [68.4, 236582.0], [68.5, 236582.0], [68.6, 236582.0], [68.7, 236582.0], [68.8, 236582.0], [68.9, 236582.0], [69.0, 236582.0], [69.1, 236582.0], [69.2, 236604.0], [69.3, 236604.0], [69.4, 236604.0], [69.5, 236604.0], [69.6, 236604.0], [69.7, 236604.0], [69.8, 236604.0], [69.9, 236604.0], [70.0, 236604.0], [70.1, 236786.0], [70.2, 236786.0], [70.3, 236786.0], [70.4, 236786.0], [70.5, 236786.0], [70.6, 236786.0], [70.7, 236786.0], [70.8, 236786.0], [70.9, 236806.0], [71.0, 236806.0], [71.1, 236806.0], [71.2, 236806.0], [71.3, 236806.0], [71.4, 236806.0], [71.5, 236806.0], [71.6, 236806.0], [71.7, 237033.0], [71.8, 237033.0], [71.9, 237033.0], [72.0, 237033.0], [72.1, 237033.0], [72.2, 237033.0], [72.3, 237033.0], [72.4, 237033.0], [72.5, 237033.0], [72.6, 237051.0], [72.7, 237051.0], [72.8, 237051.0], [72.9, 237051.0], [73.0, 237051.0], [73.1, 237051.0], [73.2, 237051.0], [73.3, 237051.0], [73.4, 237177.0], [73.5, 237177.0], [73.6, 237177.0], [73.7, 237177.0], [73.8, 237177.0], [73.9, 237177.0], [74.0, 237177.0], [74.1, 237177.0], [74.2, 237332.0], [74.3, 237332.0], [74.4, 237332.0], [74.5, 237332.0], [74.6, 237332.0], [74.7, 237332.0], [74.8, 237332.0], [74.9, 237332.0], [75.0, 237337.0], [75.1, 237337.0], [75.2, 237337.0], [75.3, 237337.0], [75.4, 237337.0], [75.5, 237337.0], [75.6, 237337.0], [75.7, 237337.0], [75.8, 237337.0], [75.9, 237860.0], [76.0, 237860.0], [76.1, 237860.0], [76.2, 237860.0], [76.3, 237860.0], [76.4, 237860.0], [76.5, 237860.0], [76.6, 237860.0], [76.7, 237874.0], [76.8, 237874.0], [76.9, 237874.0], [77.0, 237874.0], [77.1, 237874.0], [77.2, 237874.0], [77.3, 237874.0], [77.4, 237874.0], [77.5, 238278.0], [77.6, 238278.0], [77.7, 238278.0], [77.8, 238278.0], [77.9, 238278.0], [78.0, 238278.0], [78.1, 238278.0], [78.2, 238278.0], [78.3, 238278.0], [78.4, 238346.0], [78.5, 238346.0], [78.6, 238346.0], [78.7, 238346.0], [78.8, 238346.0], [78.9, 238346.0], [79.0, 238346.0], [79.1, 238346.0], [79.2, 238531.0], [79.3, 238531.0], [79.4, 238531.0], [79.5, 238531.0], [79.6, 238531.0], [79.7, 238531.0], [79.8, 238531.0], [79.9, 238531.0], [80.0, 238654.0], [80.1, 238654.0], [80.2, 238654.0], [80.3, 238654.0], [80.4, 238654.0], [80.5, 238654.0], [80.6, 238654.0], [80.7, 238654.0], [80.8, 238654.0], [80.9, 238684.0], [81.0, 238684.0], [81.1, 238684.0], [81.2, 238684.0], [81.3, 238684.0], [81.4, 238684.0], [81.5, 238684.0], [81.6, 238684.0], [81.7, 238753.0], [81.8, 238753.0], [81.9, 238753.0], [82.0, 238753.0], [82.1, 238753.0], [82.2, 238753.0], [82.3, 238753.0], [82.4, 238753.0], [82.5, 238901.0], [82.6, 238901.0], [82.7, 238901.0], [82.8, 238901.0], [82.9, 238901.0], [83.0, 238901.0], [83.1, 238901.0], [83.2, 238901.0], [83.3, 238901.0], [83.4, 239009.0], [83.5, 239009.0], [83.6, 239009.0], [83.7, 239009.0], [83.8, 239009.0], [83.9, 239009.0], [84.0, 239009.0], [84.1, 239009.0], [84.2, 239125.0], [84.3, 239125.0], [84.4, 239125.0], [84.5, 239125.0], [84.6, 239125.0], [84.7, 239125.0], [84.8, 239125.0], [84.9, 239125.0], [85.0, 239396.0], [85.1, 239396.0], [85.2, 239396.0], [85.3, 239396.0], [85.4, 239396.0], [85.5, 239396.0], [85.6, 239396.0], [85.7, 239396.0], [85.8, 239396.0], [85.9, 239403.0], [86.0, 239403.0], [86.1, 239403.0], [86.2, 239403.0], [86.3, 239403.0], [86.4, 239403.0], [86.5, 239403.0], [86.6, 239403.0], [86.7, 239431.0], [86.8, 239431.0], [86.9, 239431.0], [87.0, 239431.0], [87.1, 239431.0], [87.2, 239431.0], [87.3, 239431.0], [87.4, 239431.0], [87.5, 239608.0], [87.6, 239608.0], [87.7, 239608.0], [87.8, 239608.0], [87.9, 239608.0], [88.0, 239608.0], [88.1, 239608.0], [88.2, 239608.0], [88.3, 239608.0], [88.4, 239649.0], [88.5, 239649.0], [88.6, 239649.0], [88.7, 239649.0], [88.8, 239649.0], [88.9, 239649.0], [89.0, 239649.0], [89.1, 239649.0], [89.2, 239824.0], [89.3, 239824.0], [89.4, 239824.0], [89.5, 239824.0], [89.6, 239824.0], [89.7, 239824.0], [89.8, 239824.0], [89.9, 239824.0], [90.0, 239846.0], [90.1, 239846.0], [90.2, 239846.0], [90.3, 239846.0], [90.4, 239846.0], [90.5, 239846.0], [90.6, 239846.0], [90.7, 239846.0], [90.8, 239846.0], [90.9, 240071.0], [91.0, 240071.0], [91.1, 240071.0], [91.2, 240071.0], [91.3, 240071.0], [91.4, 240071.0], [91.5, 240071.0], [91.6, 240071.0], [91.7, 240143.0], [91.8, 240143.0], [91.9, 240143.0], [92.0, 240143.0], [92.1, 240143.0], [92.2, 240143.0], [92.3, 240143.0], [92.4, 240143.0], [92.5, 240575.0], [92.6, 240575.0], [92.7, 240575.0], [92.8, 240575.0], [92.9, 240575.0], [93.0, 240575.0], [93.1, 240575.0], [93.2, 240575.0], [93.3, 240575.0], [93.4, 240858.0], [93.5, 240858.0], [93.6, 240858.0], [93.7, 240858.0], [93.8, 240858.0], [93.9, 240858.0], [94.0, 240858.0], [94.1, 240858.0], [94.2, 241201.0], [94.3, 241201.0], [94.4, 241201.0], [94.5, 241201.0], [94.6, 241201.0], [94.7, 241201.0], [94.8, 241201.0], [94.9, 241201.0], [95.0, 241237.0], [95.1, 241237.0], [95.2, 241237.0], [95.3, 241237.0], [95.4, 241237.0], [95.5, 241237.0], [95.6, 241237.0], [95.7, 241237.0], [95.8, 241237.0], [95.9, 241781.0], [96.0, 241781.0], [96.1, 241781.0], [96.2, 241781.0], [96.3, 241781.0], [96.4, 241781.0], [96.5, 241781.0], [96.6, 241781.0], [96.7, 241938.0], [96.8, 241938.0], [96.9, 241938.0], [97.0, 241938.0], [97.1, 241938.0], [97.2, 241938.0], [97.3, 241938.0], [97.4, 241938.0], [97.5, 244120.0], [97.6, 244120.0], [97.7, 244120.0], [97.8, 244120.0], [97.9, 244120.0], [98.0, 244120.0], [98.1, 244120.0], [98.2, 244120.0], [98.3, 244120.0], [98.4, 244546.0], [98.5, 244546.0], [98.6, 244546.0], [98.7, 244546.0], [98.8, 244546.0], [98.9, 244546.0], [99.0, 244546.0], [99.1, 244546.0], [99.2, 247595.0], [99.3, 247595.0], [99.4, 247595.0], [99.5, 247595.0], [99.6, 247595.0], [99.7, 247595.0], [99.8, 247595.0], [99.9, 247595.0]], "isOverall": false, "label": "HTTP Request", "isController": false}], "supportsControllersDiscrimination": true, "maxX": 100.0, "title": "Response Time Percentiles"}},
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
        data: {"result": {"minY": 1.0, "minX": 209900.0, "maxY": 3.0, "series": [{"data": [[217200.0, 1.0], [225200.0, 1.0], [226400.0, 1.0], [228800.0, 1.0], [229200.0, 2.0], [224400.0, 1.0], [236400.0, 3.0], [232000.0, 2.0], [232800.0, 1.0], [234000.0, 2.0], [235600.0, 2.0], [231200.0, 1.0], [230400.0, 1.0], [233600.0, 1.0], [234800.0, 2.0], [235200.0, 1.0], [234400.0, 1.0], [236800.0, 1.0], [240000.0, 1.0], [240800.0, 1.0], [239600.0, 2.0], [241200.0, 2.0], [212900.0, 1.0], [219700.0, 1.0], [226900.0, 1.0], [228100.0, 2.0], [229300.0, 1.0], [233300.0, 1.0], [236500.0, 2.0], [232500.0, 2.0], [234500.0, 1.0], [237300.0, 2.0], [231700.0, 1.0], [232900.0, 1.0], [231300.0, 1.0], [230500.0, 1.0], [232100.0, 1.0], [238500.0, 1.0], [239300.0, 1.0], [240500.0, 1.0], [240100.0, 1.0], [244100.0, 1.0], [244500.0, 1.0], [238900.0, 1.0], [241700.0, 1.0], [216600.0, 1.0], [228600.0, 1.0], [227800.0, 1.0], [223800.0, 1.0], [236600.0, 1.0], [230200.0, 1.0], [230600.0, 1.0], [233400.0, 1.0], [229800.0, 1.0], [237000.0, 2.0], [235800.0, 2.0], [236200.0, 1.0], [233800.0, 3.0], [234200.0, 3.0], [235000.0, 1.0], [235400.0, 1.0], [237800.0, 2.0], [238600.0, 2.0], [239800.0, 2.0], [239400.0, 2.0], [238200.0, 1.0], [239000.0, 1.0], [209900.0, 1.0], [216300.0, 1.0], [218700.0, 1.0], [227500.0, 1.0], [233500.0, 2.0], [232700.0, 1.0], [230300.0, 1.0], [230700.0, 1.0], [231100.0, 1.0], [232300.0, 2.0], [231900.0, 1.0], [234300.0, 1.0], [233900.0, 1.0], [234700.0, 3.0], [235500.0, 2.0], [236700.0, 1.0], [237100.0, 1.0], [236300.0, 1.0], [235900.0, 2.0], [238700.0, 1.0], [238300.0, 1.0], [239100.0, 1.0], [241900.0, 1.0], [247500.0, 1.0]], "isOverall": false, "label": "HTTP Request", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 100, "maxX": 247500.0, "title": "Response Time Distribution"}},
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
        data: {"result": {"minY": 30.51666666666668, "minX": 1.52082174E12, "maxY": 60.0, "series": [{"data": [[1.52082198E12, 30.51666666666668], [1.5208218E12, 60.0], [1.52082174E12, 60.0]], "isOverall": false, "label": "Thread Group", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.52082198E12, "title": "Active Threads Over Time"}},
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
        data: {"result": {"minY": 223843.0, "minX": 1.0, "maxY": 247595.0, "series": [{"data": [[2.0, 223843.0], [3.0, 227812.0], [4.0, 230358.0], [5.0, 229306.0], [6.0, 230525.0], [7.0, 232149.0], [8.0, 231331.0], [9.0, 227592.0], [10.0, 232388.0], [11.0, 231254.0], [12.0, 239009.0], [13.0, 229882.0], [14.0, 231189.0], [15.0, 229234.0], [16.0, 230652.0], [17.0, 230794.0], [18.0, 229295.0], [19.0, 232978.0], [20.0, 233873.0], [21.0, 235294.0], [22.0, 231943.0], [23.0, 228189.0], [24.0, 228679.0], [25.0, 234707.0], [26.0, 235833.0], [27.0, 234047.0], [28.0, 232317.0], [30.0, 232277.0], [31.0, 234830.0], [33.0, 233468.0], [32.0, 234294.0], [35.0, 231777.0], [34.0, 232850.0], [37.0, 234452.0], [36.0, 237051.0], [39.0, 235408.0], [38.0, 233843.0], [41.0, 235966.0], [40.0, 234280.0], [43.0, 234298.0], [42.0, 235092.0], [45.0, 237332.0], [44.0, 228832.0], [47.0, 230413.0], [46.0, 237337.0], [49.0, 233882.0], [48.0, 241781.0], [51.0, 239403.0], [50.0, 235578.0], [53.0, 238278.0], [52.0, 236246.0], [55.0, 241201.0], [54.0, 247595.0], [57.0, 234788.0], [56.0, 238901.0], [59.0, 239608.0], [58.0, 235617.0], [60.0, 233972.6393442623], [1.0, 224459.0]], "isOverall": false, "label": "HTTP Request", "isController": false}, {"data": [[45.25833333333335, 233751.8166666667]], "isOverall": false, "label": "HTTP Request-Aggregated", "isController": false}], "supportsControllersDiscrimination": true, "maxX": 60.0, "title": "Time VS Threads"}},
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
        data : {"result": {"minY": 5.366666666666666, "minX": 1.52082174E12, "maxY": 43293.0, "series": [{"data": [[1.52082198E12, 43293.0], [1.5208218E12, 1443.1], [1.52082174E12, 41849.9]], "isOverall": false, "label": "Bytes received per second", "isController": false}, {"data": [[1.52082198E12, 161.0], [1.5208218E12, 5.366666666666666], [1.52082174E12, 155.63333333333333]], "isOverall": false, "label": "Bytes sent per second", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.52082198E12, "title": "Bytes Throughput Over Time"}},
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
        data: {"result": {"minY": 233534.1551724138, "minX": 1.52082174E12, "maxY": 244333.0, "series": [{"data": [[1.52082198E12, 233609.5166666666], [1.5208218E12, 244333.0], [1.52082174E12, 233534.1551724138]], "isOverall": false, "label": "HTTP Request", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.52082198E12, "title": "Response Time Over Time"}},
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
        data: {"result": {"minY": 41701.27586206896, "minX": 1.52082174E12, "maxY": 46939.5, "series": [{"data": [[1.52082198E12, 46282.51666666668], [1.5208218E12, 46939.5], [1.52082174E12, 41701.27586206896]], "isOverall": false, "label": "HTTP Request", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.52082198E12, "title": "Latencies Over Time"}},
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
        data: {"result": {"minY": 7.0, "minX": 1.52082174E12, "maxY": 8.999999999999998, "series": [{"data": [[1.52082198E12, 7.7], [1.5208218E12, 7.0], [1.52082174E12, 8.999999999999998]], "isOverall": false, "label": "HTTP Request", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.52082198E12, "title": "Connect Time Over Time"}},
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
        data: {"result": {"minY": 209901.0, "minX": 1.52082174E12, "maxY": 247595.0, "series": [{"data": [[1.52082198E12, 247595.0], [1.5208218E12, 244546.0], [1.52082174E12, 241938.0]], "isOverall": false, "label": "Max", "isController": false}, {"data": [[1.52082198E12, 223843.0], [1.5208218E12, 244120.0], [1.52082174E12, 209901.0]], "isOverall": false, "label": "Min", "isController": false}, {"data": [[1.52082198E12, 239843.8], [1.5208218E12, 240531.8], [1.52082174E12, 240078.2]], "isOverall": false, "label": "90th percentile", "isController": false}, {"data": [[1.52082198E12, 246954.70999999996], [1.5208218E12, 244546.0], [1.52082174E12, 241938.0]], "isOverall": false, "label": "99th percentile", "isController": false}, {"data": [[1.52082198E12, 241235.2], [1.5208218E12, 241902.94999999998], [1.52082174E12, 240876.95]], "isOverall": false, "label": "95th percentile", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.52082198E12, "title": "Response Time Percentiles Over Time (successful requests only)"}},
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
    data: {"result": {"minY": 233858.0, "minX": 0.0, "maxY": 236367.0, "series": [{"data": [[0.0, 236367.0], [1.0, 233858.0]], "isOverall": false, "label": "Successes", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.0, "title": "Response Time Vs Request"}},
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
    data: {"result": {"minY": 45340.0, "minX": 0.0, "maxY": 46333.0, "series": [{"data": [[0.0, 45340.0], [1.0, 46333.0]], "isOverall": false, "label": "Successes", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.0, "title": "Latencies Vs Request"}},
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
        data: {"result": {"minY": 0.03333333333333333, "minX": 1.5208215E12, "maxY": 0.9666666666666667, "series": [{"data": [[1.5208215E12, 0.9666666666666667], [1.5208218E12, 0.03333333333333333], [1.52082174E12, 0.9666666666666667], [1.52082156E12, 0.03333333333333333]], "isOverall": false, "label": "hitsPerSecond", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.5208218E12, "title": "Hits Per Second"}},
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
        data: {"result": {"minY": 0.03333333333333333, "minX": 1.52082174E12, "maxY": 1.0, "series": [{"data": [[1.52082198E12, 1.0], [1.5208218E12, 0.03333333333333333], [1.52082174E12, 0.9666666666666667]], "isOverall": false, "label": "200", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.52082198E12, "title": "Codes Per Second"}},
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
        data: {"result": {"minY": 0.03333333333333333, "minX": 1.52082174E12, "maxY": 1.0, "series": [{"data": [[1.52082198E12, 1.0], [1.5208218E12, 0.03333333333333333], [1.52082174E12, 0.9666666666666667]], "isOverall": false, "label": "HTTP Request-success", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.52082198E12, "title": "Transactions Per Second"}},
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
