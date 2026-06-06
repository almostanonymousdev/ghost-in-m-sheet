(function() {
    Macro.add('displayTime', {
        handler : function () {

             if (this.args.length != 1) {
                return this.error('The `<<displayTime>>` macro requires a Time to be displayed written in the 24h Military Format (0830)');
            }

            if (!Number.isInteger(this.args[0])) {
                return this.error('The `<<displayTime>>` on Passage: '+ SugarCube.State.passage + " Has a Wrong Time input: '"+ this.args[0] + "'");
            }
            let min = this.args[0] % 100 
            let hour = Math.floor(this.args[0] / 100)
            if(!(min >= 0 && min <= 59) && (hour >= 0 && hour <=23)) {
                return this.error('The Value of `<<displayTime>>` on Passage: '+ SugarCube.State.passage + " is out of bounds! Value: '"+ this.args[0] + "'");
            }

            const timeFormat = SugarCube.settings?.timeFormat || settings?.timeFormat || "24 Hour";
            let displayMin = String(min).padStart(2, "0");

            if (timeFormat == "24 Hour") {
                let displayHour = String(hour).padStart(2, "0");

                this.output.append(displayHour + ":" + displayMin);
            }

            if (timeFormat == "12 Hour") {
                let suffix = hour >= 12 ? "PM" : "AM";
                let displayHour = hour % 12 || 12;

                this.output.append(displayHour + ":" + displayMin + " " + suffix);
            }
        }
    }) 
}());