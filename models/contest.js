'use strict';

let Sequelize = require('sequelize');
let db = zoj.db;

let User = zoj.model('user');
let Problem = zoj.model('problem');
let ContestRanklist = zoj.model('contest_ranklist');
let ContestPlayer = zoj.model('contest_player');

let model = db.define('contest',
	{
		id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
		title: { type: Sequelize.STRING(80) },
		subtitle: { type: Sequelize.TEXT },
		start_time: { type: Sequelize.INTEGER },
		end_time: { type: Sequelize.INTEGER },

		holder_id: {
			type: Sequelize.INTEGER,
			references: {
				model: 'user',
				key: 'id'
			}
		},
		// type: noi, ioi, acm
		type: { type: Sequelize.TEXT },

		information: { type: Sequelize.TEXT },
		problems: { type: Sequelize.TEXT, json: true },

		ranklist_id: {
			type: Sequelize.INTEGER,
			references: {
				model: 'contest_ranklist',
				key: 'id'
			}
		},

		is_public: { type: Sequelize.BOOLEAN },
		is_protected: { type: Sequelize.BOOLEAN }
	}, {
		timestamps: false,
		tableName: 'contest',
		indexes: [
			{ fields: ['holder_id'], },
			{ fields: ['ranklist_id'], }
		]
	}
);

let Model = require('./common');
class Contest extends Model {
	static async create(val) {
		return Contest.fromRecord(Contest.model.build(Object.assign({
			title: '',
			subtitle: '',
			problems: '[]',
			information: '',
			type: '',
			start_time: 0,
			end_time: 0,
			holder: 0,
			ranklist_id: 0,
			is_public: false,
			is_protected: true
		}, val)));
	}

	async loadRelationships() {
		this.holder = await User.fromID(this.holder_id);
		this.ranklist = await ContestRanklist.fromID(this.ranklist_id);
	}

	async isAllowedEditBy(user) {
		return user && (user.admin >= 3 || this.holder_id === user.id);
	}

	async isAllowedSeeResultBy(user) {
		if (this.type == 'ioi') return true;
		return (user && (user.admin >= 3 || this.holder_id === user.id)) || !(await this.isRunning());
	}

	async getProblems() {
		return this.problems;
	}

	async setProblemsNoCheck(problems) {
		this.problems = problems;
	}

	async newSubmission(judge_state) {
		let problems = await this.getProblems();
		problems = await problems.mapAsync(x => (x.id));
		if (!problems.includes(judge_state.problem_id)) throw new ErrorMessage('No such problem in the current contest.');

		await zoj.utils.lock(['Contest::newSubmission', judge_state.user_id], async () => {
			let player = await ContestPlayer.findInContest({
				contest_id: this.id,
				user_id: judge_state.user_id
			});

			if (!player) {
				player = await ContestPlayer.create({
					contest_id: this.id,
					user_id: judge_state.user_id
				});
			}

			await player.updateScore(judge_state);
			await player.save();

			await this.loadRelationships();
			await this.ranklist.updatePlayer(this, player);
			await this.ranklist.save();
		});
	}

	async isRunning(now) {
		if (!now) now = zoj.utils.getCurrentDate();
		return now >= this.start_time && now < this.end_time;
	}

	async isEnded(now) {
		if (!now) now = zoj.utils.getCurrentDate();
		return now >= this.end_time;
	}

	getModel() { return model; }
}

Contest.model = model;

module.exports = Contest;
