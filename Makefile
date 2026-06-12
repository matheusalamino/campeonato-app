local:
	npm run local:setup

pull-stg:
	npm run local:pull:staging

pull-prod:
	npm run local:pull:production

restore-last-prod:
	npm run local:restore:last-production

check-stg:
	npm run local:check:staging

check-prod:
	npm run local:check:production
