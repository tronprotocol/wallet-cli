#!/usr/bin/env bash
# Append a well-formed row to a show-me-your-work decision log (TSV).
# Usage: log.sh <logfile> <phase> <decision> <why> <evidence> <result>
set -euo pipefail

if [ "$#" -ne 6 ]; then
	printf 'usage: log.sh <logfile> <phase> <decision> <why> <evidence> <result>\n' >&2
	exit 1
fi

logfile="$1"
shift

logdir="$(dirname "$logfile")"
if [ -n "$logdir" ] && [ "$logdir" != "." ] && [ ! -d "$logdir" ]; then
	mkdir -p "$logdir"
fi

# Use `>>` here, never `>`. A network mount can fail this test for a log
# that exists. Then the cost is one stray header line, not the rows.
if [ ! -s "$logfile" ]; then
	printf 'ts\tphase\tdecision\twhy\tevidence\tresult\n' >> "$logfile"
fi

ts="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
# Strip tabs/newlines/CR so cells stay on one line, and prefix any cell
# whose first char a spreadsheet would parse as a formula (=, +, -, @)
# or a TSV reader as an opening field quote (") with a single quote.
# The skill expects this log to be read in
# spreadsheets, so attacker-controlled evidence (PR titles, filenames,
# generated text) must not become formula execution when a reviewer
# opens the file.
clean() {
	local v
	v=$(printf '%s' "$1" | tr '\t\n\r' '   ')
	case "$v" in
		=*|+*|-*|@*|\"*) printf "'%s" "$v" ;;
		*) printf '%s' "$v" ;;
	esac
}
# A shell printf goes through stdio, which hands a row longer than its buffer
# to the kernel in pieces that parallel writers interleave.
# binmode drops the :utf8 layer PERL_UNICODE adds. syswrite refuses it on
# STDOUT, and on STDIN it decodes the row, which corrupts non-ASCII bytes.
# A short write sets no $!, so it reports its byte counts instead.
printf -v row '%s\t%s\t%s\t%s\t%s\t%s\n' \
	"$ts" "$(clean "$1")" "$(clean "$2")" "$(clean "$3")" "$(clean "$4")" "$(clean "$5")"
# perl runs once before it gets the row. A perl that is missing, a shim that
# fails, or one PERL5OPT breaks would otherwise take the row with it.
if [ "$(perl -e 'print "ok"' 2>/dev/null </dev/null)" = ok ]; then
	printf '%s' "$row" |
		perl -e 'binmode STDIN; binmode STDOUT; local $/; $_ = <STDIN>;
			my $n = syswrite(STDOUT, $_) // die "log.sh: $!\n";
			$n == length or die "log.sh: short write, appended $n of ", length, " bytes of the row\n"' \
			>> "$logfile"
else
	printf '%s' "$row" >> "$logfile"
fi
