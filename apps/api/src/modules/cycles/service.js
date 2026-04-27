export function createCycleService({ repositories }) {
  return {
    async list() {
      return repositories.cycles.list();
    },
    async getById(id) {
      return repositories.cycles.getById(id);
    },
    async create(payload) {
      return repositories.cycles.create(payload);
    }
  };
}
